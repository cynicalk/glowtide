// Voice: the speech model's download, the files it's served from, and the wake word.
//
// - The model (whisper-tiny.en, about 41 MB) is downloaded when someone first asks for voice,
//   from Hugging Face at a pinned revision. Each file is checked against its SHA-256 (in
//   shared/voice.mjs) before it's kept, so a changed or damaged file is never used.
// - Glowtide's pages read it as glowtide-voice://model/whisper-tiny.en/<file>; only the files in the
//   manifest are served, never any other path.
// - The wake word ("Hey Glowtide") is heard by Windows' own speech recogniser in a
//   PowerShell helper, with a grammar of that one phrase: it can't turn anything else said
//   into text, and nothing is recorded or sent anywhere. It runs only while it's turned on.

import { execFile, spawn } from 'child_process'
import { createHash } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { POWERSHELL } from './powershell.js'
import { fetchAllowed } from './remote.js'
import {
  DESC_VALUE,
  NAME_VALUE,
  STATE_VALUE,
  inputLabels,
  parseRegValues
} from '../shared/devices.mjs'
import {
  MODEL,
  MODEL_BYTES,
  MODEL_HOSTS,
  WAKE_MAYBE,
  WAKE_PHRASES,
  WAKE_SURE,
  isWakeText,
  modelFile,
  modelUrl,
  parseWakeLine
} from '../shared/voice.mjs'

export const VOICE_SCHEME = 'glowtide-voice'

// ---------- the microphones there are ----------
// Read from the registry, as Windows' sound settings do, not asked of a page: a page's
// device list (and even listening for devices changing) starts Chromium's camera service,
// about 100 MB, which then stays.
const CAPTURE_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Capture'
const REG_EXE = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe')

function regValues(value) {
  return new Promise((resolve) =>
    execFile(
      REG_EXE,
      ['query', CAPTURE_KEY, '/s', '/v', value],
      { windowsHide: true, timeout: 5000, maxBuffer: 1 << 20 },
      (err, out) => resolve(err ? new Map() : parseRegValues(out, value))
    )
  )
}

/** The connected recording inputs' names, e.g. ["Microphone Array (Realtek(R) Audio)"]. */
export async function microphones() {
  const [states, descs, names] = await Promise.all([
    regValues(STATE_VALUE),
    regValues(DESC_VALUE),
    regValues(NAME_VALUE)
  ])
  return inputLabels(states, descs, names)
}

// The wake helper: Windows' speech recogniser, with a grammar of the wake phrases only. It
// hears the microphone Glowtide chose (not Windows' default recording device, which can be
// Stereo Mix: the music, not you), as 16 kHz 16-bit mono PCM on its input, sent by the
// command bar window. It prints "ready <culture>", then "wake <confidence>" when a phrase is
// matched and "maybe <confidence>" when something like one was heard but not matched, and
// ends when its input closes.
const WAKE_CS = String.raw`
using System;
using System.IO;
using System.Globalization;
using System.Threading;
using System.Speech.AudioFormat;
using System.Speech.Recognition;
// Live audio from a pipe, as the recogniser wants it: it asks to seek, which a pipe can't, and
// expects each read filled (a short read would end recognition).
public class GlowtideLiveAudio : Stream {
  Stream inner; long pos;
  public GlowtideLiveAudio(Stream s) { inner = s; }
  public override bool CanRead { get { return true; } }
  public override bool CanSeek { get { return true; } }
  public override bool CanWrite { get { return false; } }
  public override long Length { get { return -1; } }
  public override long Position { get { return pos; } set { } }
  public override long Seek(long offset, SeekOrigin origin) { return pos; }
  public override void SetLength(long v) { }
  public override void Flush() { }
  public override void Write(byte[] b, int o, int c) { throw new NotSupportedException(); }
  public override int Read(byte[] buffer, int offset, int count) {
    int got = 0;
    while (got < count) {
      int n = inner.Read(buffer, offset + got, count - got);
      if (n <= 0) break;
      got += n;
    }
    pos += got;
    return got;
  }
}
public static class GlowtideWake {
  public static void Run(string phrases, string wav) {
    RecognizerInfo info = null;
    string ui = CultureInfo.CurrentUICulture.Name;
    foreach (RecognizerInfo r in SpeechRecognitionEngine.InstalledRecognizers()) {
      if (r.Culture.TwoLetterISOLanguageName != "en") continue;
      if (info == null || r.Culture.Name == ui || (r.Culture.Name == "en-US" && info.Culture.Name != ui)) info = r;
    }
    if (info == null) { Console.WriteLine("error no-recogniser"); return; }
    using (SpeechRecognitionEngine eng = new SpeechRecognitionEngine(info)) {
      GrammarBuilder gb = new GrammarBuilder(new Choices(phrases.Split('|')));
      gb.Culture = info.Culture;
      eng.LoadGrammar(new Grammar(gb));
      if (wav.Length > 0) eng.SetInputToWaveFile(wav);
      else eng.SetInputToAudioStream(new GlowtideLiveAudio(Console.OpenStandardInput()),
        new SpeechAudioFormatInfo(16000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      ManualResetEvent done = new ManualResetEvent(false);
      eng.RecognizeCompleted += (s, e) => done.Set();
      eng.SpeechRecognized += (s, e) =>
        Console.WriteLine("wake " + e.Result.Confidence.ToString("0.00", CultureInfo.InvariantCulture));
      eng.SpeechRecognitionRejected += (s, e) => {
        if (e.Result != null && e.Result.Text.Length > 0)
          Console.WriteLine("maybe " + e.Result.Confidence.ToString("0.00", CultureInfo.InvariantCulture));
      };
      eng.RecognizeAsync(RecognizeMode.Multiple);
      Console.WriteLine("ready " + info.Culture.Name);
      done.WaitOne();
    }
  }
}
`

/**
 * dir: where the model is kept; onStatus(status) when the download moves on;
 * onWake() when the wake phrase is heard; log(where, message);
 * check(pcm): Whisper's text of some 16 kHz 16-bit mono sound (a Buffer), or null.
 */
/** testWav: development runs only, a recording to listen to instead of the microphone. */
export function createVoice({
  dir,
  onStatus = () => {},
  onWake = () => {},
  log = () => {},
  check = async () => null,
  testWav = '',
  sure = WAKE_SURE
}) {
  const modelDir = join(dir, MODEL.name)
  let downloading = null // the download under way
  let progress = 0 // bytes so far
  let failed = null
  let verified = false // checked this run, so the files aren't hashed again

  const pathOf = (f) => join(modelDir, ...f.path.split('/'))

  async function sha256(file) {
    return createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
  }

  /** True when every file is there and the right size (the hashes are checked once a run). */
  function present() {
    return MODEL.files.every((f) => {
      try {
        return statSync(pathOf(f)).size === f.size
      } catch {
        return false
      }
    })
  }

  function status() {
    const ready = present()
    return {
      ready,
      downloading: !!downloading,
      percent: downloading ? Math.floor((100 * progress) / MODEL_BYTES) : ready ? 100 : 0,
      bytes: MODEL_BYTES,
      error: failed,
      wakeOn: !!helper,
      wakeError,
      lastHeard
    }
  }

  async function fetchFile(f) {
    const dest = pathOf(f)
    mkdirSync(dirname(dest), { recursive: true })
    const part = `${dest}.part`
    // the whole file within 15 minutes (about 35 KB/s for the largest)
    const r = await fetchAllowed(modelUrl(f.path), MODEL_HOSTS, { timeout: 15 * 60 * 1000 })
    if (!r?.ok || !r.body)
      throw new Error(`couldn't download ${f.path} (${r?.status || 'no answer'})`)
    const hash = createHash('sha256')
    let got = 0
    const body = Readable.fromWeb(r.body)
    body.on('data', (chunk) => {
      hash.update(chunk)
      got += chunk.length
      progress += chunk.length
      if (got > f.size) body.destroy(new Error(`${f.path} is larger than it should be`))
      else onStatus(status())
    })
    try {
      await pipeline(body, createWriteStream(part))
    } catch (e) {
      rmSync(part, { force: true })
      throw e
    }
    if (got !== f.size || hash.digest('hex') !== f.sha256) {
      rmSync(part, { force: true })
      throw new Error(`${f.path} didn't match the expected file`)
    }
    renameSync(part, dest)
  }

  /** Downloads whatever isn't there (or isn't right) yet; resolves with the status. */
  function download() {
    if (downloading) return downloading
    failed = null
    downloading = (async () => {
      progress = 0
      for (const f of MODEL.files) {
        const dest = pathOf(f)
        if (existsSync(dest) && (await sha256(dest)) === f.sha256) {
          progress += f.size
          continue
        }
        rmSync(dest, { force: true })
        await fetchFile(f)
      }
      verified = true
      log('voice', `speech model ready (${MODEL.name})`)
    })()
      .catch((e) => {
        failed = String(e?.message || e).slice(0, 200)
        log('voice', `speech model download failed: ${failed}`)
      })
      .finally(() => {
        downloading = null
        onStatus(status())
      })
    onStatus(status())
    return downloading.then(status)
  }

  /** The files are checked against their hashes once a run, before the first is served. */
  async function verify() {
    if (verified) return true
    for (const f of MODEL.files) {
      try {
        if ((await sha256(pathOf(f))) !== f.sha256) return false
      } catch {
        return false
      }
    }
    return (verified = true)
  }

  /** The protocol handler: glowtide-voice://model/<manifest path>, nothing else. */
  async function serve(req) {
    const u = new URL(req.url)
    const path = decodeURIComponent(u.pathname.slice(1)) // <model name>/<file>, as transformers.js asks
    const f =
      u.host === 'model' && path.startsWith(`${MODEL.name}/`)
        ? modelFile(path.slice(MODEL.name.length + 1))
        : null
    if (!f) return new Response('Not found', { status: 404 })
    if (!(await verify())) return new Response('Not downloaded', { status: 404 })
    const type = f.path.endsWith('.json') ? 'application/json' : 'application/octet-stream'
    return new Response(await readFile(pathOf(f)), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  function remove() {
    if (downloading) return false
    rmSync(modelDir, { recursive: true, force: true })
    verified = false
    onStatus(status())
    return true
  }

  // ---------- the wake word ----------
  let helper = null
  let wakeWanted = false
  let lastWake = 0
  let restarts = 0
  let restartTimer = null
  let wakeError = null
  let lastHeard = null // { text, sure, opened, at }: shown in Settings, to see it hears you
  let logged = 0 // what it heard goes in the log, the first few times a run

  // the last 3 seconds of sound, for Whisper to check an unsure match against
  const RING = 16000 * 2 * 3
  const ring = Buffer.alloc(RING)
  let ringAt = 0 // where the next byte goes
  let ringFull = false
  function keep(buf) {
    const b = buf.length > RING ? buf.subarray(buf.length - RING) : buf
    const first = Math.min(b.length, RING - ringAt)
    b.copy(ring, ringAt, 0, first)
    if (first < b.length) b.copy(ring, 0, first) // wrapped round to the start
    if (ringAt + b.length >= RING) ringFull = true
    ringAt = (ringAt + b.length) % RING
  }
  const lastSound = () =>
    ringFull
      ? Buffer.concat([ring.subarray(ringAt), ring.subarray(0, ringAt)])
      : ring.subarray(0, ringAt)

  // Checks are paced, so music playing out loud can't keep Whisper busy.
  let checking = false
  let lastCheck = 0
  const recent = [] // times of checks that came to nothing
  function heard(text, confidence, opened) {
    lastHeard = { text: String(text || '').slice(0, 80), sure: confidence, opened, at: Date.now() }
    onStatus(status())
    if (logged++ < 40)
      log(
        'voice',
        `heard ${text ? `"${lastHeard.text}"` : 'something'} (${Math.round(confidence * 100)}% sure): ${opened ? 'opened' : 'not the wake word'}`
      )
  }
  async function candidate(confidence) {
    if (Date.now() - lastWake < 2500) return
    if (confidence >= sure) {
      lastWake = Date.now()
      heard('', confidence, true)
      return onWake(confidence)
    }
    if (confidence < WAKE_MAYBE) {
      // too unsure even to check, but noted, to see whether it reacts to your voice at all
      if (logged++ < 40)
        log('voice', `heard something like it (${Math.round(confidence * 100)}% sure): too unsure`)
      return
    }
    if (checking) return
    const now = Date.now()
    while (recent.length && now - recent[0] > 30000) recent.shift()
    if (now - lastCheck < (recent.length >= 4 ? 6000 : 1500)) return
    checking = true
    lastCheck = now
    // the phrase has just finished: a little more of the sound after it, then look
    await new Promise((r) => setTimeout(r, 250))
    let text = null
    try {
      text = await check(lastSound())
    } catch {
      /* not checked: not the wake word */
    }
    checking = false
    const yes = isWakeText(text)
    heard(text || '', confidence, yes)
    if (!yes) return void recent.push(now)
    lastWake = Date.now()
    onWake(confidence)
  }

  function startWake() {
    wakeWanted = true
    if (helper) return
    const script = `Add-Type -AssemblyName System.Speech\nAdd-Type -ReferencedAssemblies System.Speech -TypeDefinition @'\n${WAKE_CS}\n'@\n[GlowtideWake]::Run('${WAKE_PHRASES.join('|')}', '${testWav.replace(/'/g, "''")}')`
    const p = spawn(
      POWERSHELL,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    )
    helper = p
    let buf = ''
    p.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const msg = parseWakeLine(buf.slice(0, i))
        buf = buf.slice(i + 1)
        if (!msg) continue
        if (msg.ready) {
          restarts = 0
          wakeError = null
          log('voice', `listening for "Hey Glowtide" (${msg.ready})`)
          onStatus(status())
        } else if (msg.error) {
          wakeError = msg.error
          log('voice', `wake word unavailable: ${msg.error}`)
          onStatus(status())
        } else if (msg.wake != null) candidate(msg.wake)
        else if (msg.maybe != null) candidate(Math.min(msg.maybe, sure - 0.01))
      }
    })
    p.on('error', () => {})
    p.stdin.on('error', () => {}) // writing as it ends
    p.on('exit', () => {
      if (helper === p) helper = null
      onStatus(status())
      // ended on its own (a microphone unplugged, a crash): start again, a few times
      if (wakeWanted && !wakeError && restarts < 5) {
        restarts++
        clearTimeout(restartTimer)
        restartTimer = setTimeout(() => wakeWanted && startWake(), 3000 * restarts)
      }
    })
  }

  function stopWake() {
    wakeWanted = false
    clearTimeout(restartTimer)
    const p = helper
    helper = null
    if (p) onStatus(status())
    if (p) {
      try {
        p.stdin.end() // the helper stops when its input closes
      } catch {
        /* already gone */
      }
      setTimeout(() => p.exitCode == null && p.kill(), 2000).unref?.()
    }
  }

  /** On, off, or (after the microphone changed, or the PC woke) started afresh. */
  function setWake(on, { restart = false } = {}) {
    if (!on) return stopWake()
    if (restart) {
      stopWake()
      wakeError = null
      restarts = 0
    }
    if (restart) setTimeout(() => startWake(), 600)
    else startWake()
  }

  /** The microphone, for the wake word: PCM from the command bar window. */
  function feed(buf) {
    const p = helper
    // a helper that has stopped reading (starting up, or stuck) isn't sent more than ~16 s
    keep(buf)
    if (!p || testWav || p.stdin.destroyed || p.stdin.writableLength > 512 * 1024) return
    try {
      p.stdin.write(buf)
    } catch {
      /* it's ending */
    }
  }

  /** The command bar couldn't open the microphone for the wake word. */
  function feedError(msg) {
    const m = String(msg || 'microphone').slice(0, 200)
    if (wakeError === m) return
    wakeError = m
    log('voice', `wake word can't hear: ${m}`)
    onStatus(status())
  }

  return {
    status,
    download,
    remove,
    serve,
    setWake,
    feed,
    feedError,
    get wakeOn() {
      return !!helper
    },
    get wakeError() {
      return wakeError
    },
    stop: stopWake
  }
}

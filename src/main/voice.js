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

import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { POWERSHELL } from './powershell.js'
import { fetchAllowed } from './remote.js'
import {
  MODEL,
  MODEL_BYTES,
  MODEL_HOSTS,
  WAKE_MIN_CONFIDENCE,
  WAKE_PHRASE,
  modelFile,
  modelUrl,
  parseWakeLine
} from '../shared/voice.mjs'

export const VOICE_SCHEME = 'glowtide-voice'

// The wake helper: Windows' speech recogniser, one phrase, reading the default microphone.
// It prints "ready <culture>", then "wake <confidence>" each time the phrase is heard, and
// ends when its input closes.
const WAKE_CS = String.raw`
using System;
using System.Globalization;
using System.Speech.Recognition;
public static class GlowtideWake {
  public static void Run(string phrase, string wav) {
    RecognizerInfo info = null;
    string ui = CultureInfo.CurrentUICulture.Name;
    foreach (RecognizerInfo r in SpeechRecognitionEngine.InstalledRecognizers()) {
      if (r.Culture.TwoLetterISOLanguageName != "en") continue;
      if (info == null || r.Culture.Name == ui || (r.Culture.Name == "en-US" && info.Culture.Name != ui)) info = r;
    }
    if (info == null) { Console.WriteLine("error no-recogniser"); return; }
    using (SpeechRecognitionEngine eng = new SpeechRecognitionEngine(info)) {
      GrammarBuilder gb = new GrammarBuilder(phrase);
      gb.Culture = info.Culture;
      eng.LoadGrammar(new Grammar(gb));
      try { if (wav.Length > 0) eng.SetInputToWaveFile(wav); else eng.SetInputToDefaultAudioDevice(); }
      catch (Exception) { Console.WriteLine("error no-microphone"); return; }
      eng.SpeechRecognized += (s, e) =>
        Console.WriteLine("wake " + e.Result.Confidence.ToString("0.00", CultureInfo.InvariantCulture));
      eng.RecognizeAsync(RecognizeMode.Multiple);
      Console.WriteLine("ready " + info.Culture.Name);
      while (Console.In.ReadLine() != null) { }
      eng.RecognizeAsyncCancel();
    }
  }
}
`

/**
 * dir: where the model is kept; onStatus(status) when the download moves on;
 * onWake() when the wake phrase is heard; log(where, message).
 */
/** testWav: development runs only, a recording to listen to instead of the microphone. */
export function createVoice({
  dir,
  onStatus = () => {},
  onWake = () => {},
  log = () => {},
  testWav = ''
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
      wakeError
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

  function startWake() {
    wakeWanted = true
    if (helper) return
    const script = `Add-Type -AssemblyName System.Speech\nAdd-Type -ReferencedAssemblies System.Speech -TypeDefinition @'\n${WAKE_CS}\n'@\n[GlowtideWake]::Run('${WAKE_PHRASE}', '${testWav.replace(/'/g, "''")}')`
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
        } else if (msg.wake >= WAKE_MIN_CONFIDENCE && Date.now() - lastWake > 2500) {
          lastWake = Date.now()
          onWake(msg.wake)
        }
      }
    })
    p.on('error', () => {})
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

  return {
    status,
    download,
    remove,
    serve,
    setWake,
    get wakeOn() {
      return !!helper
    },
    get wakeError() {
      return wakeError
    },
    stop: stopWake
  }
}

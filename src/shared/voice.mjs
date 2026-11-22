// Voice in the command bar: the speech model Glowtide downloads, and what a spoken line means.
// Pure: no Electron, no DOM.
//
// Speech is turned into text on the PC by Whisper (tiny, English), run by transformers.js.
// The model is downloaded once from Hugging Face, at a fixed revision, and every file is
// checked against the SHA-256 below before it's used. Nothing that's said leaves the PC.

export const MODEL = {
  name: 'whisper-tiny.en',
  repo: 'onnx-community/whisper-tiny.en',
  revision: '794207fec2761281fe63a23a94b7e9f53a4efbc1',
  licence: 'Apache-2.0',
  files: [
    {
      path: 'config.json',
      size: 2197,
      sha256: '251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233'
    },
    {
      path: 'generation_config.json',
      size: 1646,
      sha256: '7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9'
    },
    {
      path: 'preprocessor_config.json',
      size: 339,
      sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'
    },
    {
      path: 'tokenizer.json',
      size: 2405679,
      sha256: '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0'
    },
    {
      path: 'tokenizer_config.json',
      size: 282662,
      sha256: '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c'
    },
    {
      path: 'onnx/encoder_model_quantized.onnx',
      size: 10124993,
      sha256: 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25'
    },
    {
      path: 'onnx/decoder_model_merged_quantized.onnx',
      size: 30718858,
      sha256: 'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52'
    }
  ]
}

export const MODEL_BYTES = MODEL.files.reduce((n, f) => n + f.size, 0)

/** Where a model file is downloaded from. */
export const modelUrl = (path) =>
  `https://huggingface.co/${MODEL.repo}/resolve/${MODEL.revision}/${path}`

/** Hugging Face and the CDN it redirects downloads to, over https only. */
export const MODEL_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//i

/** The manifest entry for a path asked for by the page, or null (never any other file). */
export const modelFile = (path) => MODEL.files.find((f) => f.path === path) || null

// ---------- the wake word ----------

/** Heard by Windows' own speech recogniser; written as words it knows how to say. */
export const WAKE_PHRASE = 'hey glow tide'
export const WAKE_MIN_CONFIDENCE = 0.6

/** A line from the wake helper: { wake: confidence } | { ready: culture } | { error } | null. */
export function parseWakeLine(line) {
  const s = String(line ?? '').trim()
  let m = s.match(/^wake ([01](?:\.\d+)?)$/)
  if (m) return { wake: Number(m[1]) }
  m = s.match(/^ready ([a-z]{2}-[A-Z]{2})$/)
  if (m) return { ready: m[1] }
  m = s.match(/^error ([\w-]{1,40})$/)
  if (m) return { error: m[1] }
  return null
}

// ---------- what was said ----------

const ONES = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
}
const TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
}

/** "forty five", "forty-five", "45", "a hundred" → 45 / 100, or null. */
export function spokenNumber(s) {
  const t = String(s ?? '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .trim()
  if (/^\d{1,4}$/.test(t)) return Number(t)
  const w = t.split(/\s+/).filter((x) => x && x !== 'and')
  if (!w.length) return null
  if (
    w.length <= 2 &&
    w[w.length - 1] === 'hundred' &&
    (w.length === 1 || ['a', 'one'].includes(w[0]))
  )
    return 100
  if (w.length === 1 && w[0] in ONES) return ONES[w[0]]
  if (w.length === 1 && w[0] in TENS) return TENS[w[0]]
  if (w.length === 2 && w[0] in TENS && w[1] in ONES && ONES[w[1]] > 0 && ONES[w[1]] < 10)
    return TENS[w[0]] + ONES[w[1]]
  return null
}

/** "1:30", "90 seconds", "one minute thirty", "2 minutes" → "1:30" etc. (m:ss), or null. */
export function spokenTime(s) {
  const t = String(s ?? '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  let m = t.match(/^(\d{1,3}):([0-5]\d)$/)
  if (m) return `${Number(m[1])}:${m[2]}`
  m = t.match(/^(.+?) (?:minutes?|mins?)(?: (?:and )?(.+?)(?: seconds?| secs?)?)?$/)
  if (m) {
    const min = spokenNumber(m[1])
    const sec = m[2] ? spokenNumber(m[2]) : 0
    if (min != null && sec != null && sec < 60) return fmt(min * 60 + sec)
    return null
  }
  m = t.match(/^(.+?) (?:seconds?|secs?)$/)
  if (m) {
    const sec = spokenNumber(m[1])
    return sec != null ? fmt(sec) : null
  }
  // "one thirty", "1 30", "two oh five"
  const w = t.split(' ')
  if (w.length >= 2 && w.length <= 3) {
    const min = spokenNumber(w[0])
    const rest = w.slice(1)
    const sec = rest[0] === 'oh' && rest[1] ? spokenNumber(rest[1]) : spokenNumber(rest.join(' '))
    if (min != null && min < 60 && sec != null && sec < 60) return fmt(min * 60 + sec)
  }
  return null
}

// What Whisper writes for silence, noise or music, rather than speech.
const NOT_SPEECH =
  /^(you|thank you\.?|thanks for watching!?|thank you for watching\.?|bye\.?|\.+|\[[^\]]*\]|\([^)]*\)|♪+)$/i

/** Whisper's text, tidied: no [BLANK_AUDIO], music notes or end punctuation; '' if not speech. */
export function cleanTranscript(text) {
  let s = String(text ?? '')
    .replace(/\[[^\]]*\]|\([^)]*\)|♪/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (NOT_SPEECH.test(s)) return ''
  s = s.replace(/^[\s,.!?;:"'-]+|[\s,.!?;:"'-]+$/g, '')
  // the wake word, if the end of it was caught
  s = s.replace(/^(hey,? )?glow ?tide,? /i, '')
  return s.trim()
}

const said = (re, s) => re.test(s)

/**
 * A spoken line → { text, autorun }. text is what goes in the command bar (the same words
 * typed commands use); autorun: run it without Enter (a command, or "play …" / "queue …",
 * which plays or queues the first song found).
 */
export function voiceToCommand(transcript) {
  const raw = cleanTranscript(transcript)
  if (!raw) return { text: '', autorun: false }
  const s = raw
    .toLowerCase()
    .replace(/[,.!?]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(please |can you |could you |glowtide )+/, '')
    .replace(/ please$/, '')
    .trim()
  const cmd = (text) => ({ text, autorun: true })

  if (said(/^(next|skip)( (it|this|this one|song|track|this song|this track))?$/, s))
    return cmd('next')
  if (said(/^(play )?(the )?next (song|track|one)$/, s)) return cmd('next')
  if (said(/^(previous|prev|back|go back|last)( (song|track|one))?$/, s)) return cmd('previous')
  if (said(/^(play )?(the )?(previous|last) (song|track|one)$/, s)) return cmd('previous')
  if (said(/^(pause|stop)( (it|this|the music|music|the song|playing|playback))?$/, s))
    return cmd('pause')
  if (said(/^(play|resume|continue|unpause)( (it|the music|music|playing|playback))?$/, s))
    return cmd('play')
  if (said(/^(turn )?shuffle( (on|off|it))?$/, s)) return cmd('shuffle')
  if (said(/^(turn )?(repeat|loop)( (on|off|it|this|this song|the song))?$/, s))
    return cmd('repeat')
  if (
    said(
      /^(like|love|save)( (it|this|this song|the song|song))?$|^i (like|love) (this|this song|it)$/,
      s
    )
  )
    return cmd('like')
  if (said(/^(share|copy)( (it|this|this song|the link|the song|link))?$/, s)) return cmd('share')
  if (said(/^((show|hide|turn (on|off)|toggle) )?(the )?lyrics( (on|off))?$/, s))
    return cmd('lyrics')
  if (said(/^((show|hide|turn (on|off)|toggle) )?(the )?(edge )?glow( (on|off))?$/, s))
    return cmd('glow')
  if (said(/^((go |open )?(to )?)?full ?screen$/, s)) return cmd('fullscreen')
  if (said(/^((show|hide|open|turn (on|off)|toggle) )?(the )?mini( player)?( (on|off))?$/, s))
    return cmd('mini')
  if (said(/^(open|show)( the)? player$/, s)) return cmd('player')
  if (said(/^(change|switch|choose)( the)? (device|speaker)$|^(devices|speakers)$/, s))
    return cmd('device')

  let m = s.match(
    /^(?:set |turn |change )?(?:the )?(?:volume|vol)(?: (?:to|at))? (.+?)(?: percent|%)?$/
  )
  if (m) {
    const v = spokenNumber(m[1].replace(/%$/, ''))
    if (v != null) return { text: `volume ${v}`, autorun: v <= 100 }
  }
  if (said(/^mute$/, s)) return cmd('volume 0')
  m = s.match(/^(?:go|skip|jump|seek|fast forward)(?: (?:to|ahead to|forward to))? (.+)$/)
  if (m) {
    const t = spokenTime(m[1])
    if (t) return cmd(`seek ${t}`)
  }

  // "play X", "put on X", "play X by Y"; "queue X", "add X to the queue"
  const song = (q) =>
    q
      .replace(/ on (spotify|youtube( music)?)$/i, '')
      .replace(/ by /i, ' ')
      .trim()
  m = raw.match(/^(?:add|queue)\s+(.+?)(?:\s+to\s+(?:the|my)\s+queue)?$/i)
  if (m) return { text: `queue ${song(m[1])}`, autorun: true }
  m = raw.match(
    /^(?:play|put on|listen to|i want to (?:hear|listen to))\s+(?:me\s+)?(?:some\s+)?(.+)$/i
  )
  if (m) return { text: `play ${song(m[1])}`, autorun: true }
  // anything else is searched, and waits for a choice
  return { text: raw, autorun: false }
}

// ---------- which microphone ----------

// Inputs that record what the PC plays, not a voice: Windows' Stereo Mix, sound "enhancers"
// and virtual cables. Windows can have one of these as its default recording device, and
// then listening would hear the music instead of you.
const LOOPBACK =
  /stereo mix|what ?u ?hear|wave ?out|loopback|cable output|voicemeeter|vb-?audio|fxsound|virtual (audio|cable)|steam streaming|wave link stream/i

/** True for an input that records the PC's own sound rather than a microphone. */
export const isLoopbackMic = (label) => LOOPBACK.test(String(label || ''))

/**
 * The microphone to listen with, from the browser's audio inputs ([{ deviceId, label }]):
 * the one picked in Settings (by name) if it's there, else Windows' default unless that is
 * a loopback input, else the first real microphone. 'default', a device id, or null when
 * there is no real microphone at all.
 */
export function chooseMic(devices, prefer = '') {
  const list = Array.isArray(devices) ? devices : []
  const real = list.filter(
    (d) => d?.deviceId && !['default', 'communications'].includes(d.deviceId)
  )
  if (prefer) {
    const picked = real.find((d) => d.label === prefer)
    if (picked) return picked.deviceId
  }
  const def = list.find((d) => d?.deviceId === 'default')
  // no names (no permission yet): Windows' default is all there is to go on
  if (!list.some((d) => d?.label)) return list.length ? 'default' : null
  if (def && !isLoopbackMic(def.label)) return 'default'
  const mic = real.find((d) => !isLoopbackMic(d.label))
  return mic ? mic.deviceId : null
}

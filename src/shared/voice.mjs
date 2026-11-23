// Voice in the command bar: the speech model Glowtide downloads, and what a spoken line means.
// Pure: no Electron, no DOM.
//
// Speech is turned into text on the PC by Moonshine (base, English), run by transformers.js:
// in a test of spoken commands in Indian, British and American voices, clean and with
// background noise, it got as many right as Whisper base, and far more than Whisper tiny
// (which Glowtide used before), in an eighth of Whisper base's time.
// The model is downloaded once from Hugging Face, at a fixed revision, and every file is
// checked against the SHA-256 below before it's used. Nothing that's said leaves the PC.

export const MODEL = {
  name: 'moonshine-base',
  repo: 'onnx-community/moonshine-base-ONNX',
  revision: 'b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad',
  licence: 'MIT',
  files: [
    {
      path: 'config.json',
      size: 922,
      sha256: 'fab7241d1e9fc6c2370c4c6dfb5da79bb54d67ed9ab6b507ac51d29d2abe01d1'
    },
    {
      path: 'generation_config.json',
      size: 147,
      sha256: 'f9b3f711b57be7def2e50a8942f64f36ee0a55fad5b84ff93a687b6c5bcc1d44'
    },
    {
      path: 'preprocessor_config.json',
      size: 128,
      sha256: 'fa43a7017ef85cd1d0fba0d9aae77c8adb16990ae6f11115631f41ec5d8aa679'
    },
    {
      path: 'tokenizer.json',
      size: 3761754,
      sha256: '7b913404bdd039af4756783218af4440bc07fb7d6d8258d677e34f95b3ec416f'
    },
    {
      path: 'tokenizer_config.json',
      size: 135735,
      sha256: 'edaee394565d428ea98a663ae7209cdcfeefc5585c42d7a570ff7c986df2cd15'
    },
    {
      path: 'onnx/encoder_model_quantized.onnx',
      size: 20513063,
      sha256: '1dd9ab0a7f987113d30affcba5a068d11c8f90fa0223caa3e491ade431ad9751'
    },
    {
      path: 'onnx/decoder_model_merged_quantized.onnx',
      size: 42498870,
      sha256: 'cc9f3cd6698a369c6008b41aa60aa3fb3322e7f03c9bdf19d8e6b7200afca4f3'
    }
  ]
}

/** Models earlier versions downloaded: replaced by MODEL, then deleted. */
export const OLD_MODELS = ['whisper-tiny.en']

export const MODEL_BYTES = MODEL.files.reduce((n, f) => n + f.size, 0)

/** Where a model file is downloaded from. */
export const modelUrl = (path) =>
  `https://huggingface.co/${MODEL.repo}/resolve/${MODEL.revision}/${path}`

/** Hugging Face and the CDN it redirects downloads to, over https only. */
export const MODEL_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//i

/** The manifest entry for a path asked for by the page, or null (never any other file). */
export const modelFile = (path) => MODEL.files.find((f) => f.path === path) || null

// ---------- the wake word ----------

/**
 * The wake word is "Hey Glow": two everyday words both speech models know ("Glowtide", a
 * made-up word, was heard as "gloated" and the like). "Hey Glowtide" still works.
 *
 * Heard first by Windows' own speech recogniser (cheap, always on). It's strict with accents
 * it wasn't trained on, so it only proposes: a match it's very sure of (WAKE_SURE) opens the
 * command bar at once; one it's less sure of (down to WAKE_MAYBE) is checked by the speech
 * model on the last few seconds of sound first.
 */
export const WAKE_WORD = 'Hey Glow'
export const WAKE_PHRASES = ['hey glow', 'hi glow', 'okay glow', 'hey glow tide']
export const WAKE_PHRASE = WAKE_PHRASES[0]
export const WAKE_SURE = 0.93
export const WAKE_MAYBE = 0.12

// a greeting, then a word starting "glo" (glow, Glowtide, and how the model may hear them)
const GREETING = '(?:hey|hi|hay|okay|ok)'
const WAKE_LEAD = new RegExp(`^${GREETING}[,.!]?\\s+glo[a-z]*(?:\\s+tide)?[,.!?]*(?:\\s+|$)`, 'i')
const WAKE_IN = new RegExp(` ${GREETING} glo[a-z]* `)

// how a speech model may hear a quick "Hey Glow" said on its own; only taken when it's all it
// heard, so the word "halo" in a song can't wake it
const WAKE_ALONE = /^ (halo|hey low|hay low|hey glo|a glow) $/

/** Whether the model's text of the last few seconds has the wake word in it. */
export function isWakeText(text) {
  const s = ` ${String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()} `
  return WAKE_IN.test(s) || WAKE_ALONE.test(s)
}

/**
 * A line from the wake helper: { wake: confidence } (the phrase, matched), { maybe:
 * confidence } (something like it, not matched), { ready: culture }, { error }, or null.
 */
export function parseWakeLine(line) {
  const s = String(line ?? '').trim()
  let m = s.match(/^wake ([01](?:\.\d+)?)$/)
  if (m) return { wake: Number(m[1]) }
  m = s.match(/^maybe ([01](?:\.\d+)?)$/)
  if (m) return { maybe: Number(m[1]) }
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

// What speech models write for silence, noise or music, rather than speech.
const NOT_SPEECH =
  /^(you|thank you\.?|thanks for watching!?|thank you for watching\.?|bye\.?|\.+|\[[^\]]*\]|\([^)]*\)|♪+)$/i

/** The model's text, tidied: no [BLANK_AUDIO], music notes or end punctuation; '' if not speech. */
export function cleanTranscript(text) {
  let s = String(text ?? '')
    .replace(/\[[^\]]*\]|\([^)]*\)|♪/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (NOT_SPEECH.test(s)) return ''
  s = s.replace(/^[\s,.!?;:"'-]+|[\s,.!?;:"'-]+$/g, '')
  // the wake word (as the model may spell it), if it was caught
  s = s.replace(WAKE_LEAD, '')
  return s.trim()
}

const said = (re, s) => re.test(s)

/**
 * A spoken line → { text, autorun }. text is what goes in the command bar (the same words
 * typed commands use); autorun: run it without Enter (a command, or "play …" / "queue …",
 * which plays or queues the first song found).
 */
export function voiceToCommand(transcript) {
  let raw = cleanTranscript(transcript)
  if (!raw) return { text: '', autorun: false }
  // Words a speech model often hears in place of a command's first word (especially with an
  // Indian or British accent): "post the music" is "pause the music", "said the volume" is
  // "set the volume", "ad Levitating to the queue" is "add", "played X" is "play X".
  raw = raw
    .replace(/^(?:post|pose|paws|pours|for)(?= (?:the|a) (?:music|song)\b)/i, 'pause')
    .replace(/^(?:said|sat|sit)(?= the volume\b)/i, 'set')
    .replace(/ to (the|my) (?:cue|q|tube)$/i, ' to $1 queue')
    .replace(/^(?:ad|and|at)(?= .+ to (?:the|my) queue$)/i, 'add')
    .replace(/^played(?= )/i, 'play')
  const s = raw
    .toLowerCase()
    .replace(/[,.!?]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(please |can you |could you |glowtide )+/, '')
    .replace(/ please$/, '')
    .trim()
  const cmd = (text) => ({ text, autorun: true })

  if (said(/^(next|skip)( (it|this|this one|so|song|track|this so|this song|this track))?$/, s))
    return cmd('next')
  if (said(/^(play )?(the )?next (song|track|one)$/, s)) return cmd('next')
  if (said(/^(previous|prev|back|go back|last)( (song|track|one))?$/, s)) return cmd('previous')
  if (said(/^(play )?(the )?(previous|last) (song|track|one)$/, s)) return cmd('previous')
  if (said(/^(pause|stop)( (it|this|the music|a music|music|the song|playing|playback))?$/, s))
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
  const m0 = s.match(
    /^(?:switch to|switch over to|use|play from|go to|change to) (spotify|youtube(?: music)?)$/
  )
  if (m0) return cmd(m0[1].startsWith('youtube') ? 'youtube' : 'spotify')
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
  // "please Shape of You by Ed Sheeran": a "play" heard as "please", with nothing else it could be
  m = raw.match(/^please\s+(.+\s+by\s+.+)$/i)
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

// names that say "microphone", tried first when nothing else decides
const MICLIKE = /micro?phone|\bmic\b|array|headset|webcam|camera/i

/**
 * What Settings offers: the real microphones (never Stereo Mix and the like, which can't hear
 * you), and which one shows as chosen: the one picked, else the one used last, else the
 * likeliest (a name that says microphone). labels: the inputs' names.
 */
export function micOptions(labels, picked = '', lastUsed = '') {
  const options = [...new Set((labels || []).filter((l) => l && !isLoopbackMic(l)))].sort(
    (a, b) => Number(MICLIKE.test(b)) - Number(MICLIKE.test(a))
  )
  const value = [picked, lastUsed].find((l) => l && options.includes(l)) || options[0] || ''
  return { options, value }
}

// ---------- the sound handed to the model ----------

/**
 * The part of a recording that has speech in it, with a little room either side: Moonshine
 * hears nothing in a clip that's mostly quiet (it was trained on clips cut to the speech).
 * samples: 16 kHz mono Float32Array. Returns a view of it, or an empty one if it's all quiet.
 */
export function speechSpan(samples, rate = 16000) {
  const frame = Math.round(rate * 0.02)
  const n = Math.floor(samples.length / frame)
  if (!n) return samples.subarray(0, 0)
  const level = new Float32Array(n)
  let peak = 0
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = f * frame; i < (f + 1) * frame; i++) s += samples[i] * samples[i]
    level[f] = Math.sqrt(s / frame)
    if (level[f] > peak) peak = level[f]
  }
  const loud = Math.max(0.006, peak * 0.15)
  let first = -1
  let last = -1
  for (let f = 0; f < n; f++)
    if (level[f] > loud) {
      if (first < 0) first = f
      last = f
    }
  if (first < 0) return samples.subarray(0, 0)
  const from = Math.max(0, first * frame - Math.round(rate * 0.2))
  const to = Math.min(samples.length, (last + 1) * frame + Math.round(rate * 0.3))
  return samples.subarray(from, to)
}

/**
 * What the speech model is given: the speech (speechSpan) with half a second of silence
 * either side, which is what Moonshine hears best (in a test of Indian, British and American
 * voices: every wake word and command, where tighter or looser room lost some).
 * Empty if there's no speech.
 */
export function forModel(samples, rate = 16000) {
  const s = speechSpan(samples, rate)
  if (!s.length) return new Float32Array(0)
  const room = Math.round(rate * 0.5)
  const out = new Float32Array(room + s.length + room)
  out.set(s, room)
  return out
}

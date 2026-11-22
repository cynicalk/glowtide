// The microphone Glowtide listens with: the one picked in Settings, else Windows' default
// unless that records the PC's own sound (Stereo Mix and the like), else the first real
// microphone. See chooseMic in shared/voice.mjs.

import { chooseMic, isLoopbackMic } from '../../../shared/voice.mjs'

const VOICE = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}

async function inputs() {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput')
  } catch {
    return []
  }
}

/** A stream from the right microphone. prefer: a microphone's name from Settings, or ''. */
export async function micStream(prefer = '') {
  const list = await inputs()
  const id = chooseMic(list, prefer)
  if (!id && list.length) {
    const e = new Error('only inputs that record what the PC plays')
    e.name = 'NotFoundError'
    throw e
  }
  const audio = id && id !== 'default' ? { ...VOICE, deviceId: { exact: id } } : VOICE
  return navigator.mediaDevices.getUserMedia({ audio })
}

/** The microphones there are, for Settings: [{ label, loopback }] (no defaults or duplicates). */
export async function micList() {
  const seen = new Set()
  const out = []
  for (const d of await inputs()) {
    if (['default', 'communications'].includes(d.deviceId) || !d.label || seen.has(d.label))
      continue
    seen.add(d.label)
    out.push({ label: d.label, loopback: isLoopbackMic(d.label) })
  }
  return out
}

/**
 * The wake word's ears: the microphone, continuously, as 16 kHz 16-bit mono PCM handed to
 * send(ArrayBuffer) about four times a second, for Windows' recogniser in the main process.
 * Follows a microphone being plugged in or out. Returns stop().
 */
export function wakeFeed({ mic = '', send, onError }) {
  let stopped = false
  let ctx = null
  let stream = null
  let again = null

  const teardown = () => {
    for (const t of stream?.getTracks() || []) t.stop()
    stream = null
    ctx?.close().catch(() => {})
    ctx = null
  }
  const start = async () => {
    const s = await micStream(mic)
    if (stopped) return s.getTracks().forEach((t) => t.stop())
    stream = s
    ctx = new AudioContext({ sampleRate: 16000 })
    const src = ctx.createMediaStreamSource(s)
    const proc = ctx.createScriptProcessor(4096, 1, 1)
    const mute = ctx.createGain()
    mute.gain.value = 0
    src.connect(proc)
    proc.connect(mute).connect(ctx.destination)
    proc.onaudioprocess = (e) => {
      const x = e.inputBuffer.getChannelData(0)
      const pcm = new Int16Array(x.length)
      for (let i = 0; i < x.length; i++) pcm[i] = Math.max(-1, Math.min(1, x[i])) * 32767
      send(pcm.buffer)
    }
  }
  const begin = () => start().catch((e) => !stopped && onError?.(e))
  // a microphone plugged in or out: choose again
  const changed = () => {
    clearTimeout(again)
    again = setTimeout(() => {
      if (stopped) return
      teardown()
      begin()
    }, 1200)
  }
  navigator.mediaDevices.addEventListener('devicechange', changed)
  begin()
  return () => {
    stopped = true
    clearTimeout(again)
    navigator.mediaDevices.removeEventListener('devicechange', changed)
    teardown()
  }
}

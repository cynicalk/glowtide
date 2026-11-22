// The microphone Glowtide listens with: the one picked in Settings, else Windows' default
// unless that records the PC's own sound (Stereo Mix and the like), else the first real
// microphone. See chooseMic in shared/voice.mjs.
//
// The one chosen is remembered and opened directly next time. Asking the page for the device
// list (or to hear about devices changing) starts Chromium's camera service, about 100 MB,
// which then stays: so the list is only asked for when the remembered microphone is gone and
// Windows' default won't do.

import { chooseMic, isLoopbackMic } from '../../../shared/voice.mjs'

const VOICE = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}
const KEY = 'glowtide-mic'

/** The microphone used last time: { id, label }, or null. */
export function rememberedMic() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null')
    return r && typeof r.id === 'string' && typeof r.label === 'string' ? r : null
  } catch {
    return null
  }
}
function remember(id, label) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, label }))
  } catch {
    /* not kept: it's chosen again next time */
  }
}

const open = (id) =>
  navigator.mediaDevices.getUserMedia({
    audio: id && id !== 'default' ? { ...VOICE, deviceId: { exact: id } } : VOICE
  })
const labelOf = (s) => s.getAudioTracks()[0]?.label || ''
const stop = (s) => s.getTracks().forEach((t) => t.stop())
// a microphone (not the PC's own sound), and the one asked for if one was
const usable = (s, prefer) => {
  const l = labelOf(s)
  return !!l && !isLoopbackMic(l) && (!prefer || l === prefer)
}

/** A stream from the right microphone. prefer: a microphone's name from Settings, or ''. */
export async function micStream(prefer = '') {
  // 1. the one used last time, opened directly
  const r = rememberedMic()
  if (r && (!prefer || r.label === prefer)) {
    try {
      const s = await open(r.id)
      if (usable(s, prefer)) return s
      stop(s)
    } catch (e) {
      if (e?.name === 'NotAllowedError') throw e
    }
  }
  // 2. Windows' default, if it's a real microphone
  if (!prefer) {
    try {
      const s = await open('default')
      if (usable(s, '')) return s
      stop(s)
    } catch (e) {
      if (e?.name === 'NotAllowedError') throw e
    }
  }
  // 3. the device list, this once: choose, open and remember
  let list = []
  try {
    list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput')
  } catch {
    /* none */
  }
  const id = chooseMic(list, prefer)
  if (!id) {
    const e = new Error('only inputs that record what the PC plays')
    e.name = 'NotFoundError'
    throw e
  }
  const s = await open(id)
  if (id !== 'default') remember(id, labelOf(s))
  return s
}

/**
 * The wake word's ears: the microphone, continuously, as 16 kHz 16-bit mono PCM handed to
 * send(ArrayBuffer) about four times a second, for Windows' recogniser in the main process.
 * If the microphone goes away (unplugged), it chooses again. Returns stop().
 */
export function wakeFeed({ mic = '', send, onError }) {
  let stopped = false
  let ctx = null
  let stream = null
  let again = null

  const teardown = () => {
    if (stream) stop(stream)
    stream = null
    ctx?.close().catch(() => {})
    ctx = null
  }
  const start = async () => {
    const s = await micStream(mic)
    if (stopped) return stop(s)
    stream = s
    // unplugged: choose again in a moment
    s.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (stopped || stream !== s) return
      clearTimeout(again)
      again = setTimeout(() => {
        if (stopped) return
        teardown()
        begin()
      }, 1500)
    })
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
  begin()
  return () => {
    stopped = true
    clearTimeout(again)
    teardown()
  }
}

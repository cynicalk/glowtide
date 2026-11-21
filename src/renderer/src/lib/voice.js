// Listening in the command bar: the microphone, when you start and stop talking, and the
// Whisper worker that turns it into text. The recording stays in this page's memory and is
// dropped once it's been understood; nothing is saved or sent anywhere.

import VoiceWorker from './voiceWorker.js?worker'

const RATE = 16000 // what Whisper takes
const IDLE_MS = 3 * 60 * 1000 // the model is let go (about 150 MB) after this long unused

let worker = null
let seq = 0
const waiting = new Map()
let idle = null

function getWorker() {
  if (!worker) {
    worker = new VoiceWorker()
    worker.onmessage = ({ data }) => {
      const p = waiting.get(data?.id)
      if (!p) return
      waiting.delete(data.id)
      data.ok ? p.resolve(data.text ?? '') : p.reject(new Error(data.error || 'speech failed'))
    }
    worker.onerror = (e) => {
      for (const p of waiting.values()) p.reject(new Error(e?.message || 'speech worker failed'))
      waiting.clear()
      worker?.terminate()
      worker = null
    }
  }
  clearTimeout(idle)
  idle = setTimeout(() => {
    if (waiting.size) return
    worker?.terminate()
    worker = null
  }, IDLE_MS)
  return worker
}

function ask(msg, transfer) {
  const w = getWorker()
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    w.postMessage({ ...msg, id }, transfer || [])
  })
}

/** Loads the model ahead of the first words (it takes a second or two). */
export const warmUp = () => ask({ type: 'load' }).catch(() => {})

/** 16 kHz mono samples → what was said (Whisper's raw text). */
export const transcribe = (samples) => {
  const copy = new Float32Array(samples) // the worker takes its own copy
  return ask({ type: 'transcribe', audio: copy }, [copy.buffer])
}

// A soft rising tone: listening has started.
function chime(ctx) {
  try {
    const t = ctx.currentTime
    for (const [f, at] of [
      [660, 0],
      [990, 0.09]
    ]) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0, t + at)
      g.gain.linearRampToValueAtTime(0.08, t + at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.16)
      o.connect(g).connect(ctx.destination)
      o.start(t + at)
      o.stop(t + at + 0.18)
    }
  } catch {
    /* no sound: fine */
  }
}

const concat = (parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

/**
 * Records one thing said: from when you start talking until you've been quiet a moment.
 * Resolves with 16 kHz samples, or null when nothing was said (or it was cancelled).
 *   onLevel(0..1)    how loud, for the button
 *   onSpeech()       talking has started
 *   onPartial(text)  what's been understood so far (every second or so while talking)
 *   signal           an AbortSignal to stop listening
 */
export async function listen({ onLevel, onSpeech, onPartial, signal, sound = true } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })
  const ctx = new AudioContext({ sampleRate: RATE })
  const src = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(2048, 1, 1) // 128 ms a block
  const mute = ctx.createGain()
  mute.gain.value = 0
  src.connect(proc)
  proc.connect(mute).connect(ctx.destination)
  if (sound) chime(ctx)

  const parts = []
  let floor = 0
  let blocks = 0
  let loud = 0
  let started = false
  let quietMs = 0
  let spokenMs = 0
  let partialBusy = false
  let lastPartial = 0
  const BLOCK_MS = (2048 / RATE) * 1000

  return new Promise((resolve) => {
    let finished = false
    const finish = (keep) => {
      if (finished) return
      finished = true
      proc.onaudioprocess = null
      try {
        src.disconnect()
        proc.disconnect()
      } catch {
        /* already */
      }
      for (const t of stream.getTracks()) t.stop() // the microphone is let go at once
      ctx.close().catch(() => {})
      clearTimeout(giveUp)
      signal?.removeEventListener('abort', onAbort)
      resolve(keep && parts.length ? concat(parts) : null)
    }
    const onAbort = () => finish(false)
    signal?.addEventListener('abort', onAbort)
    // nothing said within 6 s: stop
    const giveUp = setTimeout(() => !started && finish(false), 6000)

    proc.onaudioprocess = (e) => {
      const x = e.inputBuffer.getChannelData(0)
      let sum = 0
      for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
      const rms = Math.sqrt(sum / x.length)
      blocks++
      // the first quarter second (after the chime) sets how loud the room is
      if (blocks <= 3) {
        floor = blocks === 1 ? rms : floor * 0.6 + rms * 0.4
        return
      }
      const threshold = Math.max(0.012, floor * 2.4)
      onLevel?.(Math.min(1, rms / (threshold * 4)))
      const voiced = rms > threshold
      if (!started) {
        // a little of what came just before talking started is kept, so the first sound isn't cut
        parts.push(new Float32Array(x))
        if (parts.length > 3) parts.shift()
        loud = voiced ? loud + 1 : 0
        if (loud >= 2) {
          started = true
          onSpeech?.()
        } else floor = floor * 0.95 + rms * 0.05
        return
      }
      parts.push(new Float32Array(x))
      spokenMs += BLOCK_MS
      quietMs = voiced ? 0 : quietMs + BLOCK_MS
      if (quietMs >= 900 || spokenMs >= 9000) return finish(true)
      // what's been heard so far, while talking
      if (onPartial && !partialBusy && spokenMs - lastPartial >= 1100) {
        partialBusy = true
        lastPartial = spokenMs
        transcribe(concat(parts))
          .then((t) => !finished && onPartial(t))
          .catch(() => {})
          .finally(() => (partialBusy = false))
      }
    }
  })
}

// System audio (loopback) analysis: spectrum, waveform, bass energy and beats.
// Listens to what the PC plays, never the microphone, and nothing leaves the analyser.

/**
 * Starts listening. onFrame is called every animation frame with
 *   { ok, freq: Uint8Array, wave: Uint8Array, sampleRate, energy 0..1, pulse 0..1, level 0..1 }
 * or { ok: false } when there is no system audio (muted, another output, or unavailable).
 * fps caps how often it analyses (the glow and the lyric styles need 30; a visualizer 60).
 * Smoothing and beat decay are per second, not per frame, so they feel the same at any rate.
 * Returns a stop function.
 */
export function startAudio(onFrame, { fps = 60 } = {}) {
  let stopped = false
  let ctx, stream, raf
  ;(async () => {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      stream.getVideoTracks().forEach((t) => t.stop()) // we only want the sound
      if (!stream.getAudioTracks().length) throw new Error('no loopback audio')
      if (stopped) return stream.getTracks().forEach((t) => t.stop())
      ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser()
      an.fftSize = 2048
      an.smoothingTimeConstant = 0.55
      src.connect(an)
      const freq = new Uint8Array(an.frequencyBinCount)
      const wave = new Uint8Array(an.fftSize)
      const hz = ctx.sampleRate / an.fftSize
      const lo = Math.max(1, Math.floor(35 / hz))
      const hi = Math.ceil(160 / hz)
      let avg = 0.1
      let prev = 0
      let pulse = 0
      let lastBeat = 0
      let lastSound = performance.now()
      let lastFrame = 0
      const gap = 1000 / fps - 2
      const loop = (now) => {
        if (now - lastFrame < gap) {
          raf = requestAnimationFrame(loop)
          return
        }
        const k = Math.min(4, (now - (lastFrame || now - 16.7)) / 16.7) // frames' worth of time
        lastFrame = now
        an.getByteFrequencyData(freq)
        an.getByteTimeDomainData(wave)
        let e = 0
        for (let i = lo; i <= hi; i++) e += freq[i]
        e = e / ((hi - lo + 1) * 255)
        let peak = 0
        for (let i = 0; i < wave.length; i += 4) peak = Math.max(peak, Math.abs(wave[i] - 128))
        if (e > 0.02 || peak > 3) lastSound = now
        // Silence for 2 s while "playing" (muted, another output device): no signal, not a quiet song.
        if (now - lastSound > 2000) {
          onFrame({ ok: false })
          raf = requestAnimationFrame(loop)
          return
        }
        const keep = Math.pow(0.985, k)
        avg = avg * keep + e * (1 - keep)
        if (e > avg * 1.22 && e - prev > 0.015 && e > 0.08 && now - lastBeat > 200) {
          pulse = 1
          lastBeat = now
        }
        pulse *= Math.pow(0.9, k)
        prev = e
        onFrame({
          ok: true,
          freq,
          wave,
          sampleRate: ctx.sampleRate,
          energy: Math.min(1, e / Math.max(0.05, avg * 1.6)),
          pulse,
          level: Math.min(1, peak / 100)
        })
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    } catch (err) {
      console.warn('Glowtide: system audio unavailable.', err)
      onFrame({ ok: false })
    }
  })()
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    ctx?.close()
  }
}

/** Beats and bass energy only: onLevel(pulse, energy), or onLevel(null) with no audio. */
export function startBeatTracker(onLevel, { fps = 30 } = {}) {
  return startAudio((f) => (f.ok ? onLevel(f.pulse, f.energy) : onLevel(null)), { fps })
}

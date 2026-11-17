// Beat detection on system audio (loopback). Bass energy against its own
// running average: a beat is a jump well above the recent level.
export function startBeatTracker(onLevel) {
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
      an.smoothingTimeConstant = 0.5
      src.connect(an)
      const bins = new Uint8Array(an.frequencyBinCount)
      const hz = ctx.sampleRate / an.fftSize
      const lo = Math.max(1, Math.floor(35 / hz))
      const hi = Math.ceil(160 / hz)
      let avg = 0.1
      let prev = 0
      let pulse = 0
      let lastBeat = 0
      let lastSound = performance.now()
      const loop = (now) => {
        an.getByteFrequencyData(bins)
        let e = 0
        for (let i = lo; i <= hi; i++) e += bins[i]
        e = e / ((hi - lo + 1) * 255)
        if (e > 0.02) lastSound = now
        // Silence for 2s while "playing" (muted, another output device): no signal, not a quiet song.
        if (now - lastSound > 2000) {
          onLevel(null)
          raf = requestAnimationFrame(loop)
          return
        }
        avg = avg * 0.985 + e * 0.015
        if (e > avg * 1.22 && e - prev > 0.015 && e > 0.08 && now - lastBeat > 200) {
          pulse = 1
          lastBeat = now
        }
        pulse *= 0.9
        prev = e
        onLevel(pulse, Math.min(1, e / Math.max(0.05, avg * 1.6)))
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    } catch (err) {
      console.warn('Glowtide: audio pulse unavailable, using a gentle breathe instead.', err)
      onLevel(null)
    }
  })()
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    ctx?.close()
  }
}

import { useEffect, useRef } from 'react'
import { useColours, useGlowtide } from '../lib/store'

// Beat detection on system audio (loopback). Bass energy against its own
// running average: a beat is a jump well above the recent level.
function startBeatTracker(onLevel) {
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

export default function Glow() {
  const { state, settings } = useGlowtide()
  const colours = useColours(state, settings)
  const el = useRef(null)
  const level = useRef({ pulse: 0, energy: 0, ok: true })
  const playing = !!state?.playback?.isPlaying
  const react = !!settings?.glow.reactToAudio

  useEffect(() => {
    if (!playing || !react) return
    level.current.ok = true
    return startBeatTracker((pulse, energy) => {
      if (pulse === null) level.current = { pulse: 0, energy: 0, ok: false }
      else level.current = { pulse, energy, ok: true }
    })
  }, [playing, react])

  useEffect(() => {
    if (!settings || !colours) return
    let raf
    const g = settings.glow
    const loop = (t) => {
      const node = el.current
      if (node) {
        let strength
        if (!state?.track || (!playing && g.idle === 'off')) strength = 0
        else if (!playing) strength = 0.6
        else if (react && level.current.ok)
          strength = 0.8 + 0.15 * level.current.energy + 0.35 * level.current.pulse
        else strength = 0.85 + 0.15 * Math.sin(t / 900) // no audio signal: a slow breathe, not a fake beat
        const k = Math.min(1.3, strength) * (g.intensity / 100) * 1.35
        node.style.opacity = String(Math.min(1, k))
        node.style.setProperty('--sp', `${g.spread * (0.8 + 0.4 * Math.min(1, strength))}px`)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [settings, colours, playing, react, state?.track])

  if (!settings || !colours) return null
  return (
    <div
      ref={el}
      className={`edge ${settings.colour.fade ? 'fade' : ''}`}
      style={{ '--c': colours.glow, '--th': `${settings.glow.thickness}px`, opacity: 0 }}
    />
  )
}

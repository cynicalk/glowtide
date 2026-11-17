import { useEffect, useRef } from 'react'
import { startAudio } from '../lib/beat'
import { logBands, shape, smoothInto } from '../../../shared/viz.mjs'
import { drawViz } from './draw'

/**
 * A live visualizer on a canvas, drawn from the PC's sound output.
 * style: bars | mirror | blocks | ring | waveform | aurora. palette: three hex colours.
 * fps caps the frame rate; with nothing playing it drops to 20 and settles to a calm idle.
 * onBeat(pulse, energy) lets the host react too (ripples, glows).
 */
export default function Visualizer({
  style = 'bars',
  palette,
  density = 48,
  glow = true,
  sensitivity = 1,
  fps = 60,
  playing = true,
  ringInner,
  onBeat,
  className = ''
}) {
  const canvas = useRef(null)
  const live = useRef({
    style,
    palette,
    density,
    glow,
    sensitivity,
    fps,
    playing,
    ringInner,
    onBeat
  })
  useEffect(() => {
    live.current = { style, palette, density, glow, sensitivity, fps, playing, ringInner, onBeat }
  }, [style, palette, density, glow, sensitivity, fps, playing, ringInner, onBeat])

  useEffect(() => {
    const cv = canvas.current
    const ctx = cv.getContext('2d')
    let w = 0
    let h = 0
    let dpr = 1
    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = Math.max(1, Math.round(cv.clientWidth * dpr))
      h = Math.max(1, Math.round(cv.clientHeight * dpr))
      cv.width = w
      cv.height = h
    }
    const ro = new ResizeObserver(fit)
    ro.observe(cv)
    fit()

    let frame = { ok: false }
    const stop = startAudio((f) => (frame = f))
    const state = {
      bands: new Float32Array(live.current.density),
      wave: new Uint8Array(512).fill(128),
      pulse: 0,
      energy: 0,
      t: 0
    }
    let raf
    let last = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const o = live.current
      const quiet = !o.playing || !frame.ok
      const minGap = 1000 / (quiet ? 20 : o.fps)
      if (now - last < minGap - 1) return
      last = now
      if (state.bands.length !== o.density) state.bands = new Float32Array(o.density)
      state.t = now / 1000
      if (!quiet) {
        const raw = logBands(frame.freq, o.density, { sampleRate: frame.sampleRate })
        for (let i = 0; i < raw.length; i++) raw[i] = shape(raw[i], o.sensitivity)
        smoothInto(state.bands, raw)
        state.wave = frame.wave
        state.pulse = frame.pulse
        state.energy = frame.energy
      } else {
        // nothing playing: settle to a low, slow breathe rather than an invented spectrum
        const idle = new Float32Array(o.density).map(
          (_, i) => 0.04 + 0.03 * Math.sin(state.t * 1.3 + i * 0.35)
        )
        smoothInto(state.bands, idle, { rise: 0.1, fall: 0.1 })
        state.wave = state.idleWave ||= new Uint8Array(512).fill(128)
        state.pulse *= 0.9
        state.energy *= 0.9
      }
      o.onBeat?.(state.pulse, state.energy)
      if (o.palette)
        drawViz(ctx, o.style, state, w, h, o.palette, {
          dpr,
          glow: o.glow,
          sensitivity: o.sensitivity,
          ringInner: o.ringInner
        })
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      stop()
    }
  }, [])

  return <canvas ref={canvas} className={`viz-canvas ${className}`} />
}

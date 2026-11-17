import { useEffect, useRef } from 'react'
import { useColours, useGlowtide } from '../lib/store'
import { startBeatTracker } from '../lib/beat'

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

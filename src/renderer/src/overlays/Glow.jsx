import { useEffect, useRef } from 'react'
import { useColours, useGlowtide } from '../lib/store'
import { startBeatTracker } from '../lib/beat'

export default function Glow() {
  const { state, settings } = useGlowtide()
  const colours = useColours(state, settings)
  const el = useRef(null)
  const flow = useRef(null)
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
    let angle = 0
    let last = performance.now()
    const loop = (t) => {
      // The travelling light: a slow lap when quiet, faster with the music.
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      const live = playing && react && level.current.ok
      const speed = 22 + (live ? level.current.energy * 70 + level.current.pulse * 110 : 0)
      angle = (angle + dt * speed) % 360
      if (flow.current) {
        flow.current.style.setProperty('--flow-a', `${angle.toFixed(1)}deg`)
        flow.current.style.opacity = !state?.track || (!playing && g.idle === 'off') ? '0' : ''
      }
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
  const moving = settings.glow.motion !== 'still'
  const vars = {
    '--c': colours.glow,
    '--c2': colours.highlight,
    '--c3': colours.lyrics,
    '--th': `${settings.glow.thickness}px`,
    '--sp': `${settings.glow.spread}px`
  }
  return (
    <>
      <div
        ref={el}
        className={`edge ${settings.colour.fade ? 'fade' : ''}`}
        style={{ ...vars, opacity: 0 }}
      />
      {moving && (
        <div ref={flow} className={`edge-flow ${settings.colour.fade ? 'fade' : ''}`} style={vars}>
          <div className="flow-soft">
            <i />
          </div>
          <div className="flow-sharp">
            <i />
          </div>
        </div>
      )}
    </>
  )
}

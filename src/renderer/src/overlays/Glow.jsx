import { useEffect, useRef, useState } from 'react'
import { useColours, useGlowtide } from '../lib/store'
import { startBeatTracker } from '../lib/beat'
import { useFrameRateCap } from '../lib/frameRate'
import { ANIMATIONS, dayTint, duoGradient, glowAnimation } from '../../../shared/glow.mjs'

/**
 * The edge glow. Nothing on it is ever repainted while music plays; per frame it only
 * changes things the compositor applies on its own:
 * - the frame is painted once; the music changes its opacity and that of a softer outer
 *   halo laid over it (the "swell"),
 * - the travelling light is a gradient that is turned (a transform), faster with the music.
 *
 * One colour: a steady frame in the glow colour with a light of the same colour travelling
 * round it. Two colours: the frame itself is the two colours, sharing the edge by the split
 * and blending where they meet, and the animation carries them round.
 *
 * Animations (shared/glow.mjs): Default travels at a steady pace, Music Sync travels faster
 * and swells with the beat, Idle drifts slowly and breathes, No Animation holds still.
 * One loop drives it all at the chosen frame rate (30 or 60), and only while something
 * plays and something moves. Paused, it all holds still and nothing runs.
 */
/** Glow by time of day (when on): how warm and dim, looked at again every five minutes. */
function useDayTint(on) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setTick((n) => n + 1), 5 * 60000)
    return () => clearInterval(id)
  }, [on])
  return on ? dayTint() : null
}

// The warm light the glow leans to at night: a soft amber, like a lamp.
const WARM = '#ff9a4d'

export default function Glow() {
  const { state, settings } = useGlowtide()
  const colours = useColours(state, settings)
  const edge = useRef(null)
  const halo = useRef(null)
  const spinners = useRef([])
  const angle = useRef(0)
  const level = useRef({ pulse: 0, energy: 0, ok: true })
  const playing = !!state?.playback?.isPlaying
  const hasTrack = !!state?.track
  const g = settings?.glow
  const anim = ANIMATIONS[glowAnimation(g)]
  const react = anim.react
  const moving = anim.move
  const duo = g?.gradient === 2
  const shown = hasTrack && (playing || g?.idle !== 'off')
  const fps = settings?.fps === 60 ? 60 : 30
  useFrameRateCap(fps)
  const tint = useDayTint(!!g?.timeOfDay)
  // at night the glow is up to 40% dimmer
  const nightDim = tint ? 1 - 0.4 * tint.dim : 1

  useEffect(() => {
    if (!playing || !react) return
    level.current.ok = true
    return startBeatTracker(
      (pulse, energy) => {
        if (pulse === null) level.current = { pulse: 0, energy: 0, ok: false }
        else level.current = { pulse, energy, ok: true }
      },
      { fps }
    )
  }, [playing, react, fps])

  useEffect(() => {
    if (!g) return
    const intensity = (g.intensity / 100) * nightDim
    const turn = (deg) => {
      angle.current = (angle.current + deg) % 360
      const tf = `translate(-50%, -50%) rotate(${angle.current.toFixed(2)}deg)`
      for (const el of spinners.current) if (el) el.style.transform = tf
    }
    const apply = (strength) => {
      const k = Math.min(1.3, strength) * intensity * 1.35
      if (edge.current) edge.current.style.opacity = Math.min(1, k).toFixed(3)
      // the halo carries what used to be a wider shadow on loud passages
      if (halo.current)
        halo.current.style.opacity = (
          Math.max(0, Math.min(1, (strength - 0.7) * 2)) * intensity
        ).toFixed(3)
    }
    turn(0)
    if (!shown || !playing) {
      apply(shown ? 0.6 : 0) // paused: a steady glow, and nothing runs
      return
    }
    if (!moving && !react && !anim.breathe) {
      apply(0.9) // No Animation: full and still, and nothing runs
      return
    }
    let raf
    let last = 0
    const breatheMs = anim.speed < 10 ? 1700 : 900
    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      // every frame of this window is copied out for Windows, so fewer frames are cheaper
      if (t - last < 1000 / fps - 2) return
      const dt = Math.min(0.1, (t - (last || t - 1000 / fps)) / 1000)
      last = t
      const live = react && level.current.ok
      const { energy, pulse } = level.current
      // no audio signal: a slow breathe, not a fake beat
      const strength = live
        ? 0.8 + 0.15 * energy + 0.35 * pulse
        : 0.85 + anim.breathe * Math.sin(t / breatheMs)
      apply(strength)
      if (moving) turn(dt * (anim.speed + (live ? energy * 70 + pulse * 110 : 0)))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [g, anim, shown, playing, react, moving, fps, duo, nightDim])

  if (!settings || !colours) return null
  // at night every colour of the glow leans warm (up to half amber)
  const warm = (x) =>
    tint?.warmth ? `color-mix(in srgb, ${x} ${Math.round(100 - 50 * tint.warmth)}%, ${WARM})` : x
  const c = warm(colours.glow)
  const vars = {
    '--c': c,
    '--g2': warm(colours.glow2),
    // one colour: the travelling light is a brighter shade of the glow, not other colours
    '--c2': duo ? warm(colours.highlight) : `color-mix(in srgb, ${c} 60%, white)`,
    '--c3': duo ? warm(colours.lyrics) : c,
    '--th': `${settings.glow.thickness}px`,
    '--sp': `${settings.glow.spread}px`
  }
  const fade = settings.colour.fade ? 'fade' : ''
  const layer = (cls, i, background) => (
    <div className={cls}>
      <div className="flow-frame">
        <i ref={(el) => (spinners.current[i] = el)} style={background ? { background } : null} />
      </div>
    </div>
  )
  if (duo) {
    const bg = duoGradient(g.split)
    return (
      <>
        <div ref={edge} className={`edge-duo ${fade}`} style={{ ...vars, opacity: 0 }}>
          {layer('flow-soft', 0, bg)}
          {layer('flow-sharp duo-line', 1, bg)}
        </div>
        <div ref={halo} className={`edge-halo duo ${fade}`} style={{ ...vars, opacity: 0 }} />
      </>
    )
  }
  return (
    <>
      <div ref={edge} className={`edge ${fade}`} style={{ ...vars, opacity: 0 }} />
      <div ref={halo} className={`edge-halo ${fade}`} style={{ ...vars, opacity: 0 }} />
      {moving && (
        <div className={`edge-flow ${fade}`} style={{ ...vars, opacity: shown ? undefined : 0 }}>
          {layer('flow-soft', 0)}
          {layer('flow-sharp', 1)}
        </div>
      )}
    </>
  )
}

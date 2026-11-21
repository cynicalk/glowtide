import { useEffect, useMemo, useRef, useState } from 'react'
import { api, positionOf, useColours, useGlowtide } from '../lib/store'
import { startAudio, startBeatTracker } from '../lib/beat'
import { estimateOffset, suggestNudge } from '../../../shared/timing.mjs'
import { useFrameRateCap } from '../lib/frameRate'
import {
  ANIMATIONS,
  chorusLines,
  dayTint,
  duoGradient,
  glowAnimation
} from '../../../shared/glow.mjs'

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

/**
 * Glow reacts to the lyrics (when on): a soft flash round the edge as each line starts, and
 * the chorus a little brighter. One timer to the next line's start, never a loop; the flash
 * is an opacity animation the compositor runs. Returns whether the chorus is being sung.
 */
function useLyricMoments({ on, lines, playback, durationMs, offsetMs, flashRef, still }) {
  const [chorus, setChorus] = useState(false)
  const choruses = useMemo(() => (on ? chorusLines(lines) : new Set()), [on, lines])
  const playing = !!playback?.isPlaying
  useEffect(() => {
    if (!on || !playing || !lines?.length) {
      const id = setTimeout(() => setChorus(false), 0)
      return () => clearTimeout(id)
    }
    let timer
    // the line being sung at pos (-1 before the first)
    const lineAt = (pos) => {
      let i = -1
      for (let k = 0; k < lines.length; k++) if (lines[k].t <= pos) i = k
      return i
    }
    const step = (fire) => {
      const pos = positionOf(playback, durationMs) + (offsetMs || 0)
      const i = lineAt(pos)
      setChorus(i >= 0 && choruses.has(i))
      if (fire && !still && i >= 0 && String(lines[i].text || '').trim())
        flashRef.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], {
          duration: 900,
          easing: 'ease-out'
        })
      const next = lines[i + 1]
      if (next) timer = setTimeout(() => step(true), Math.max(30, next.t - pos))
    }
    timer = setTimeout(() => step(false), 0)
    return () => clearTimeout(timer)
  }, [on, playing, lines, playback, durationMs, offsetMs, choruses, flashRef, still])
  return chorus
}

// Which glow this is (one per display); only the first listens for the timing check.
const GLOW_INDEX =
  Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('d')) || 0
// Songs checked already in this run, so each is listened to once.
const timingChecked = new Set()

/**
 * Auto lyric timing check (Settings → Lyrics): for the first minute of a song with synced
 * lyrics (not ones you timed), listen to how sharply the vocal range rises, and if the lines
 * clearly run early or late against it, tell the player, which offers the nudge. It stops
 * listening as soon as it has enough, and never listens to the same song twice in a run.
 */
function useTimingCheck({ on, state, lyrics }) {
  const tr = state?.track
  const eligible =
    on &&
    GLOW_INDEX === 0 &&
    !!state?.playback?.isPlaying &&
    !!tr &&
    state.source !== 'demo' && // the demo makes no sound to listen to
    state.lyricsStatus === 'synced' &&
    state.lyricsSource !== 'Timed by you' &&
    (lyrics?.length || 0) >= 8 &&
    !timingChecked.has(tr.id)
  const latest = useRef(null)
  useEffect(() => {
    latest.current = {
      playback: state?.playback,
      durationMs: tr?.durationMs,
      offset: state?.lyricsOffsetMs || 0
    }
  })
  const trackId = tr?.id
  useEffect(() => {
    if (!eligible) return
    const starts = lyrics.filter((l) => String(l.text || '').trim()).map((l) => l.t)
    const samples = []
    let prev = null
    let lo = 0
    let hi = 0
    let done = false
    let stop = null
    const finish = () => {
      if (done) return
      done = true
      stop?.()
      timingChecked.add(trackId)
      samples.sort((a, b) => a.t - b.t) // a seek can leave them out of order
      const n = suggestNudge(estimateOffset(samples, starts), latest.current?.offset || 0)
      if (n !== null) api.timingHint(trackId, n)
    }
    // whatever happens (a muted PC, no sound reaching Windows), it stops listening after 80 s
    const cap = setTimeout(finish, 80000)
    stop = startAudio(
      (f) => {
        if (done || !f.ok) return
        const p = latest.current
        if (!p) return
        if (!prev) {
          // the vocal range, about 300 Hz to 3.4 kHz
          const hz = f.sampleRate / (f.freq.length * 2)
          lo = Math.max(1, Math.floor(300 / hz))
          hi = Math.min(f.freq.length - 1, Math.ceil(3400 / hz))
          prev = new Uint8Array(f.freq.length)
          prev.set(f.freq)
          return
        }
        // how sharply it rose since the last frame (spectral flux)
        let flux = 0
        for (let i = lo; i <= hi; i++) {
          const d = f.freq[i] - prev[i]
          if (d > 0) flux += d
        }
        prev.set(f.freq)
        const t = positionOf(p.playback, p.durationMs)
        samples.push({ t, v: flux })
        // enough heard: 14 lines with room either side, or 75 seconds
        const from = samples[0].t
        const heard = starts.filter((s) => s > from + 2200 && s < t - 2200).length
        if (heard >= 14 || t - from > 75000) finish()
      },
      { fps: 30 }
    )
    return () => {
      clearTimeout(cap)
      if (!done) {
        done = true
        stop?.()
      }
    }
  }, [eligible, trackId, lyrics])
}

// The warm light the glow leans to at night: a soft amber, like a lamp.
const WARM = '#ff9a4d'

export default function Glow() {
  const { state, settings, lyrics } = useGlowtide()
  const colours = useColours(state, settings)
  const edge = useRef(null)
  const halo = useRef(null)
  const flash = useRef(null)
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
  const lyricOn = !!g?.lyrics && state?.lyricsStatus === 'synced'
  const chorus = useLyricMoments({
    on: lyricOn,
    lines: lyrics,
    playback: state?.playback,
    durationMs: state?.track?.durationMs,
    offsetMs: state?.lyricsOffsetMs,
    flashRef: flash,
    still: !!settings?.reduceMotion
  })
  // the chorus a quarter brighter
  const boost = chorus ? 1.25 : 1
  useTimingCheck({ on: settings?.lyrics?.timingCheck !== false, state, lyrics })

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
    const intensity = (g.intensity / 100) * nightDim * boost
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
  }, [g, anim, shown, playing, react, moving, fps, duo, nightDim, boost])

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
        {lyricOn && (
          <div
            ref={flash}
            className={`edge-halo edge-flash duo ${fade}`}
            style={{ ...vars, opacity: 0 }}
          />
        )}
      </>
    )
  }
  return (
    <>
      <div ref={edge} className={`edge ${fade}`} style={{ ...vars, opacity: 0 }} />
      <div ref={halo} className={`edge-halo ${fade}`} style={{ ...vars, opacity: 0 }} />
      {lyricOn && (
        <div
          ref={flash}
          className={`edge-halo edge-flash ${fade}`}
          style={{ ...vars, opacity: 0 }}
        />
      )}
      {moving && (
        <div className={`edge-flow ${fade}`} style={{ ...vars, opacity: shown ? undefined : 0 }}>
          {layer('flow-soft', 0)}
          {layer('flow-sharp', 1)}
        </div>
      )}
    </>
  )
}

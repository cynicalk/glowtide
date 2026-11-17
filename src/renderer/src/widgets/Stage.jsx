import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { api, useGlowtide } from '../lib/store'
import Visualizer from '../viz/Visualizer'
import { vizPalette, VIZ_STYLES, THEMES } from '../../../shared/viz.mjs'

const COLOURS = ['album', ...Object.keys(THEMES)]

/**
 * Full screen: the cover blurred and drifting as the room light, a sharp copy in the
 * middle, the visualizer orbiting it (Ring) or rising underneath, a ripple on every bass hit.
 * Keys: Space play/pause, arrows previous/next, V next visualizer, C next colours, Esc leave.
 */
export default function Stage() {
  const { state, settings } = useGlowtide()
  const [idle, setIdle] = useState(false)
  const [ripples, setRipples] = useState([])
  const lastRipple = useRef(0)
  const cfg = settings?.widgets.stage
  const playing = !!state?.playback?.isPlaying

  // Controls fade away once the mouse rests.
  useEffect(() => {
    let t
    const wake = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), 2500)
    }
    wake()
    window.addEventListener('mousemove', wake)
    return () => {
      window.removeEventListener('mousemove', wake)
      clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    const key = (e) => {
      if (!settings) return
      const s = settings.widgets.stage
      if (e.key === 'Escape') api.stage('close')
      else if (e.key === ' ') api.control(playing ? 'pause' : 'play')
      else if (e.key === 'ArrowRight') api.control('next')
      else if (e.key === 'ArrowLeft') api.control('previous')
      else if (e.key === 'v' || e.key === 'V') {
        const i = VIZ_STYLES.indexOf(s.style)
        api.setSettings({ widgets: { stage: { style: VIZ_STYLES[(i + 1) % VIZ_STYLES.length] } } })
      } else if (e.key === 'c' || e.key === 'C') {
        const i = COLOURS.indexOf(s.theme)
        api.setSettings({ widgets: { stage: { theme: COLOURS[(i + 1) % COLOURS.length] } } })
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [settings, playing])

  // A soft ripple out from the cover on strong bass hits.
  const onBeat = useCallback((pulse) => {
    const now = performance.now()
    if (pulse > 0.85 && now - lastRipple.current > 380) {
      lastRipple.current = now
      setRipples((r) => [...r.slice(-4), now])
    }
  }, [])

  if (!state || !settings) return <div className="stage" />
  const t = state.track
  const palette = vizPalette(cfg.theme, {
    palette: state.palette,
    accent: settings.widgets.viz.accent
  })
  const ring = cfg.style === 'ring'
  return (
    <div
      className={`stage ${idle ? 'idle' : ''}`}
      style={{ '--p1': palette[0], '--p2': palette[1], '--p3': palette[2] }}
    >
      {t?.cover && <img className="stage-bg" src={t.cover} alt="" />}
      <div className="stage-shade" />
      <div className={`stage-viz ${ring ? 'ring' : 'under'}`}>
        <Visualizer
          style={cfg.style}
          palette={palette}
          density={ring ? 72 : 64}
          glow
          fps={settings.widgets.fps}
          playing={playing}
          ringInner={0.215}
          onBeat={onBeat}
        />
      </div>
      <div className={`stage-centre ${ring ? 'ring' : 'under'}`}>
        {ripples.map((k) => (
          <span
            key={k}
            className="ripple"
            onAnimationEnd={() => setRipples((r) => r.filter((x) => x !== k))}
          />
        ))}
        {t?.cover ? (
          <img className="stage-cover" src={t.cover} alt="" />
        ) : (
          <div className="stage-cover empty" />
        )}
      </div>
      {t && (
        <div className="stage-title">
          <div className="st-name">{t.name}</div>
          <div className="st-artist">{t.artists}</div>
        </div>
      )}
      <div className="stage-hint">
        V visualizer · C colours · Esc leave · {cfg.style} · {cfg.theme}
      </div>
      <div className="stage-controls">
        <button aria-label="Previous" onClick={() => api.control('previous')}>
          <SkipBack size={22} />
        </button>
        <button
          className="big"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => api.control(playing ? 'pause' : 'play')}
        >
          {playing ? <Pause size={28} /> : <Play size={28} />}
        </button>
        <button aria-label="Next" onClick={() => api.control('next')}>
          <SkipForward size={22} />
        </button>
      </div>
    </div>
  )
}

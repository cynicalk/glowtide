import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, MicVocal, Minus, Plus } from 'lucide-react'
import { api, useColours, useGlowtide } from '../lib/store'
import Visualizer from '../viz/Visualizer'
import { Wallpaper } from '../lib/Backgrounds'
import { vizPalette, VIZ_STYLES, THEMES } from '../../../shared/viz.mjs'
import { STYLES as LYRIC_STYLES } from '../player/lyricStyles'

const COLOURS = ['album', ...Object.keys(THEMES)]

/**
 * Full screen: the cover blurred and drifting as the room light, a sharp copy in the
 * middle, the visualizer orbiting it (Ring) or rising underneath, a ripple on every bass hit.
 * Keys: Space play/pause, arrows previous/next, V next visualizer, C next colours, L next
 * lyrics style, Esc leave. The lyrics button opens the lyrics' own options: on or off, their
 * style and their size, so they can be changed without leaving full screen.
 */
const LYRIC_IDS = LYRIC_STYLES.map((s) => s[0])
export default function Stage() {
  const { state, settings } = useGlowtide()
  const [idle, setIdle] = useState(false)
  const [ripples, setRipples] = useState([])
  const [lyricsPanel, setLyricsPanel] = useState(false)
  const lastRipple = useRef(0)
  const cfg = settings?.widgets.stage
  const colours = useColours(state, settings)
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
      } else if (e.key === 'l' || e.key === 'L') {
        const i = LYRIC_IDS.indexOf(settings.lyrics.style)
        api.setSettings({
          lyrics: { overlay: true, style: LYRIC_IDS[(i + 1) % LYRIC_IDS.length] }
        })
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
    accent: settings.widgets.accent
  })
  const ring = cfg.style === 'ring'
  return (
    <div
      className={`stage ${idle && !lyricsPanel ? 'idle' : ''}`}
      style={{ '--p1': palette[0], '--p2': palette[1], '--p3': palette[2] }}
    >
      {settings.background?.fullscreen && settings.background.kind !== 'cover' ? (
        <Wallpaper bg={settings.background} colours={colours} className="stage-wall" />
      ) : (
        t?.cover && <img className="stage-bg" src={t.coverSoft || t.cover} alt="" />
      )}
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
          <div className={`stage-cover ${playing ? 'moving' : ''}`}>
            <img src={t.cover} alt="" />
          </div>
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
        V visualizer · C colours · L lyrics · Esc leave · {cfg.style} · {cfg.theme}
      </div>
      {lyricsPanel && <StageLyrics settings={settings} onClose={() => setLyricsPanel(false)} />}
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
        <button
          className={`lyr-btn ${lyricsPanel ? 'on' : ''}`}
          aria-label="Lyrics options"
          aria-expanded={lyricsPanel}
          onClick={() => setLyricsPanel(!lyricsPanel)}
        >
          <MicVocal size={20} />
        </button>
      </div>
    </div>
  )
}

/** The lyrics' options, over full screen: on or off, style and size. */
function StageLyrics({ settings, onClose }) {
  const l = settings.lyrics
  const size = (d) =>
    api.setSettings({ lyrics: { size: Math.min(160, Math.max(50, (l.size || 100) + d)) } })
  return (
    <div className="stage-lyrics" role="dialog" aria-label="Lyrics">
      <div className="sl-row">
        <span>Lyrics on screen</span>
        <button
          role="switch"
          aria-checked={!!l.overlay}
          className={`sl-switch ${l.overlay ? 'on' : ''}`}
          onClick={() => api.setSettings({ lyrics: { overlay: !l.overlay } })}
        >
          <i />
        </button>
      </div>
      <div className={`sl-styles ${l.overlay ? '' : 'off'}`}>
        {LYRIC_STYLES.map(([id, label, Icon]) => (
          <button
            key={id}
            className={l.style === id ? 'on' : ''}
            aria-pressed={l.style === id}
            onClick={() => api.setSettings({ lyrics: { overlay: true, style: id } })}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="sl-row">
        <span>Size</span>
        <span className="sl-size">
          <button aria-label="Smaller lyrics" onClick={() => size(-10)} disabled={l.size <= 50}>
            <Minus size={16} />
          </button>
          <b>{l.size || 100}%</b>
          <button aria-label="Bigger lyrics" onClick={() => size(10)} disabled={l.size >= 160}>
            <Plus size={16} />
          </button>
        </span>
      </div>
      <button className="sl-done" onClick={onClose}>
        Done
      </button>
    </div>
  )
}

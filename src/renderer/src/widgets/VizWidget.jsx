import { ChevronLeft, ChevronRight, Pin, PictureInPicture2, AppWindow } from 'lucide-react'
import { api, useGlowtide } from '../lib/store'
import Visualizer from '../viz/Visualizer'
import EditChrome from './EditChrome'
import { vizPalette, VIZ_STYLES } from '../../../shared/viz.mjs'

const place = new URLSearchParams(window.location.hash.split('?')[1] || '').get('place')

function NowCard({ layout, track }) {
  return (
    <div className={`vw-card ${layout}`}>
      {layout !== 'text' && track.cover && <img src={track.cover} alt="" />}
      <div className="vw-text">
        <div className="vw-title">{track.name}</div>
        <div className="vw-artist">{track.artists}</div>
      </div>
    </div>
  )
}

/** The desktop visualizer widget: a live visualizer and what's playing. */
export default function VizWidget() {
  const { state, settings } = useGlowtide()
  if (!state || !settings) return null
  const c = settings.widgets.viz
  const palette = vizPalette(c.theme, { palette: state.palette, accent: c.accent })
  const t = state.track
  const playing = !!state.playback?.isPlaying
  const editable = place !== 'wallpaper'
  const step = (d) => {
    const i = VIZ_STYLES.indexOf(c.style)
    api.setSettings({
      widgets: { viz: { style: VIZ_STYLES[(i + d + VIZ_STYLES.length) % VIZ_STYLES.length] } }
    })
  }
  const setPlace = (p) => api.setSettings({ widgets: { viz: { placement: p } } })
  return (
    <div
      className={`vw card-${t ? c.card : 'none'} ${editable ? 'editable' : ''}`}
      style={{
        opacity: c.opacity / 100,
        '--backdrop': c.backdrop / 100,
        '--p1': palette[0],
        '--p2': palette[1],
        '--p3': palette[2]
      }}
    >
      <div className="vw-backdrop" />
      {c.artGlow && t?.cover && <img className="vw-art-glow" src={t.cover} alt="" />}
      <div className="vw-viz">
        <Visualizer
          style={c.style}
          palette={palette}
          density={c.density}
          glow={c.glow}
          sensitivity={c.sensitivity / 100}
          fps={settings.widgets.fps}
          playing={playing}
        />
      </div>
      {t && c.card !== 'none' && <NowCard layout={c.card} track={t} />}
      <EditChrome kind="viz" place={place} />
      {editable && (
        <div className="vw-bar">
          <button title="Previous style" onClick={() => step(-1)}>
            <ChevronLeft size={14} />
          </button>
          <span>{c.style}</span>
          <button title="Next style" onClick={() => step(1)}>
            <ChevronRight size={14} />
          </button>
          {place !== 'edit' && (
            <>
              <i />
              <button title="Put it on the wallpaper" onClick={() => setPlace('wallpaper')}>
                <Pin size={13} />
              </button>
              <button
                title={place === 'top' ? 'Ordinary window' : 'Always on top'}
                onClick={() => setPlace(place === 'top' ? 'window' : 'top')}
              >
                {place === 'top' ? <AppWindow size={13} /> : <PictureInPicture2 size={13} />}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

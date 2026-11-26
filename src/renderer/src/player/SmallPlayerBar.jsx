import { Maximize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { api } from '../lib/store'
import { dragHandlers } from '../lib/drag'

/**
 * The strip under the video in the small player (YouTube, minimised): the song, previous /
 * play / next, and back to the full player. Drag it to move the small player.
 */
export default function SmallPlayerBar({ state }) {
  const t = state.track
  const playing = !!state.playback?.isPlaying
  return (
    <div
      className="small-bar"
      {...dragHandlers()}
      onDoubleClick={(e) => !e.target.closest('button') && api.windowAction('unsmall')}
    >
      <div className="small-text">
        <div className="small-title">{t?.name || 'Nothing playing'}</div>
        <div className="small-artist">{t?.artists || ''}</div>
      </div>
      <button
        className="mb"
        aria-label="Previous"
        title="Previous"
        onClick={() => api.control('previous')}
      >
        <SkipBack size={14} />
      </button>
      <button
        className="mb big"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        onClick={() => api.control(playing ? 'pause' : 'play')}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button className="mb" aria-label="Next" title="Next" onClick={() => api.control('next')}>
        <SkipForward size={14} />
      </button>
      <button
        className="mb"
        aria-label="Back to the full player"
        title="Back to the full player"
        onClick={() => api.windowAction('unsmall')}
      >
        <Maximize2 size={14} />
      </button>
    </div>
  )
}

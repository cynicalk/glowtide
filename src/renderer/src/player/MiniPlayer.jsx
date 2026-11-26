import { useEffect } from 'react'
import { Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { api, useColours, useGlowtide, usePosition } from '../lib/store'
import { dragHandlers } from '../lib/drag'
import { lineIndexAt } from '../../../shared/lyrics.mjs'

// as the main process sizes its window (main/index.js MINI_SCALE)
const SCALE = { small: 0.8, medium: 1, large: 1.3, xl: 1.6 }

const REPEAT_NEXT = { off: 'context', context: 'track', track: 'off' }

/**
 * The mini player beside the tray: the cover (a click opens the player), the song, and
 * previous / play / next, with like, shuffle and repeat if chosen in Settings → App. It
 * never takes focus from the app you're in. Drag it anywhere by the song; right-click it for
 * its size and to put it back by the clock.
 */
export default function MiniPlayer() {
  const { state, settings, lyrics } = useGlowtide()
  const colours = useColours(state, settings)
  const scale = SCALE[settings?.mini?.size] || 1
  // everything grows with the window: the whole page is zoomed
  useEffect(() => {
    document.documentElement.style.zoom = String(scale)
  }, [scale])
  if (!state || !settings) return null
  const t = state.track
  const pb = state.playback
  const m = settings.mini || {}
  const playing = !!pb?.isPlaying
  const sys = state.source === 'system'
  const followOnly = state.source === 'spotify' && state.spotifyPlan === 'free'
  const can = (a) =>
    !!t &&
    !followOnly &&
    (!sys ||
      !!state.caps?.[a] ||
      (!!state.spotifyBridge &&
        ['play', 'pause', 'next', 'previous', 'seek', 'shuffle', 'repeat'].includes(a)))
  return (
    <div
      className="mini"
      style={{ '--glow': colours?.glow || '#7c5cff' }}
      {...dragHandlers()}
      onContextMenu={(e) => {
        e.preventDefault()
        api.miniMenu()
      }}
    >
      <button
        className="mini-art"
        aria-label="Open the player"
        title="Open the player"
        onClick={() => api.showPlayer()}
      >
        {t?.thumb || t?.cover ? <img src={t.thumb || t.cover} alt="" /> : null}
      </button>
      {/* drag it by the song (and the space around) */}
      <div className="mini-text">
        <div className="mini-title">{t?.name || 'Nothing playing'}</div>
        <MiniSub state={state} lyrics={lyrics} on={!!m.lyric} />
      </div>
      <div className="mini-btns">
        {m.like && (
          <button
            className={`mb ${state.liked ? 'on' : ''}`}
            aria-label="Like"
            title={
              state.source === 'spotify' || state.source === 'youtube'
                ? 'Like'
                : 'Like · with Spotify or YouTube'
            }
            disabled={
              (state.source !== 'spotify' && state.source !== 'youtube') || state.liked == null
            }
            onClick={() => api.control('like', !state.liked)}
          >
            <Heart size={14} fill={state.liked ? 'currentColor' : 'none'} />
          </button>
        )}
        {m.shuffle && (
          <button
            className={`mb ${pb?.shuffle ? 'on' : ''}`}
            aria-label="Shuffle"
            title="Shuffle"
            disabled={!can('shuffle')}
            onClick={() => api.control('shuffle', !pb?.shuffle)}
          >
            <Shuffle size={14} />
          </button>
        )}
        <button
          className="mb"
          aria-label="Previous"
          title="Previous"
          disabled={!can('previous')}
          onClick={() => api.control('previous')}
        >
          <SkipBack size={15} />
        </button>
        <button
          className="mb big"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          disabled={!can(playing ? 'pause' : 'play')}
          onClick={() => api.control(playing ? 'pause' : 'play')}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          className="mb"
          aria-label="Next"
          title="Next"
          disabled={!can('next')}
          onClick={() => api.control('next')}
        >
          <SkipForward size={15} />
        </button>
        {m.repeat && (
          <button
            className={`mb ${pb?.repeat && pb.repeat !== 'off' ? 'on' : ''}`}
            aria-label="Repeat"
            title="Repeat"
            disabled={!can('repeat')}
            onClick={() => api.control('repeat', REPEAT_NEXT[pb?.repeat || 'off'])}
          >
            {pb?.repeat === 'track' ? <Repeat1 size={14} /> : <Repeat size={14} />}
          </button>
        )}
      </div>
      {m.progress !== false && t && <MiniProgress state={state} />}
    </div>
  )
}

/** A thin bar along the bottom: how far into the song. */
function MiniProgress({ state }) {
  const d = state.track?.durationMs || 0
  const pos = usePosition(state.playback, d, 1000)
  const pct = d ? Math.min(100, (pos / d) * 100) : 0
  return (
    <div className="mini-progress" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Under the song: the line being sung (if chosen, and the song has timed lyrics), or the artist. */
function MiniSub({ state, lyrics, on }) {
  const synced = on && state.lyricsStatus === 'synced' && lyrics?.length > 0
  const pos = usePosition(state.playback, state.track?.durationMs, synced ? 250 : 60000)
  const line = synced ? lyrics[lineIndexAt(lyrics, pos + (state.lyricsOffsetMs || 0))]?.text : null
  return (
    <div className={`mini-artist ${line ? 'lyric' : ''}`}>{line || state.track?.artists || ''}</div>
  )
}

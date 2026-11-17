import { useEffect, useState } from 'react'
import {
  Heart,
  ListMusic,
  Search,
  Settings as Cog,
  MonitorSpeaker,
  Library,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Shuffle,
  Repeat,
  Repeat1,
  MicVocal,
  Minus,
  X,
  SunMedium
} from 'lucide-react'
import { api, fmtTime, useColours, useGlowtide, usePosition } from '../lib/store'
import Welcome from './Welcome'
import Connect from './Connect'
import SettingsPanel from './SettingsPanel'
import YouTubeStage from './YouTubeStage'
import { SearchPanel, LibraryPanel, QueuePanel, DevicesPanel } from './Panels'
import { YtSearch, YtLibrary, YtQueue } from './YtPanels'
import { SystemInfo, SystemApps } from './SystemPanels'

const LYRIC_STATUS = {
  loading: 'Looking for lyrics…',
  synced: 'Synced lyrics · word timing estimated',
  plain: 'Lyrics found, but without timing, so the overlay stays off',
  instrumental: 'Instrumental',
  none: 'No synced lyrics for this song',
  error: "Couldn't reach the lyrics service"
}

const SOURCE_TAG = { demo: 'Demo', youtube: 'YouTube', spotify: 'Spotify', system: 'Any app' }

export default function Player() {
  const { state, settings, lyrics } = useGlowtide()
  const colours = useColours(state, settings)
  const [panel, setPanel] = useState(null)
  useEffect(() => api.onDebugPanel(setPanel), [])

  if (!state || !settings) return <div className="player" />
  const fade = settings.colour.fade ? 'fade' : ''
  let screen = 'player'
  if (!state.source) screen = 'welcome'
  else if (state.source === 'spotify' && !state.connected) screen = 'spotify-setup'
  const yt = state.source === 'youtube'
  const sys = state.source === 'system'
  const tag =
    sys && state.systemApp ? `Following ${state.systemApp.label}` : SOURCE_TAG[state.source]

  return (
    <div
      className={`player ${fade}`}
      style={{
        '--glow': colours.glow,
        '--lyr': colours.lyrics,
        '--hi': colours.highlight,
        '--hi-text': colours.highlightText
      }}
    >
      <TitleBar tag={screen === 'player' ? tag : null} />
      {screen === 'welcome' && <Welcome state={state} setPanel={setPanel} />}
      {screen === 'spotify-setup' && (
        <Connect state={state} settings={settings} onBack={() => api.setSource(null)} />
      )}
      {screen === 'player' && (
        <NowPlaying state={state} settings={settings} lyrics={lyrics} setPanel={setPanel} />
      )}
      {panel && (
        <Sheet title={PANEL_TITLES[panel]} onClose={() => setPanel(null)}>
          {panel === 'search' &&
            (sys ? (
              <SystemInfo state={state} what="Search" />
            ) : yt ? (
              <YtSearch state={state} />
            ) : (
              <SearchPanel state={state} />
            ))}
          {panel === 'library' &&
            (sys ? (
              <SystemInfo state={state} what="Pick music" />
            ) : yt ? (
              <YtLibrary state={state} settings={settings} />
            ) : (
              <LibraryPanel state={state} />
            ))}
          {panel === 'queue' &&
            (sys ? (
              <SystemInfo state={state} what="Your queue lives" />
            ) : yt ? (
              <YtQueue state={state} />
            ) : (
              <QueuePanel state={state} />
            ))}
          {(panel === 'devices' || panel === 'apps') &&
            (sys ? <SystemApps state={state} /> : <DevicesPanel state={state} />)}
          {panel === 'settings' && <SettingsPanel state={state} settings={settings} />}
        </Sheet>
      )}
    </div>
  )
}

const PANEL_TITLES = {
  search: 'Search',
  library: 'Library',
  queue: 'Queue',
  devices: 'Devices',
  apps: 'Follow which app?',
  settings: 'Settings'
}

function TitleBar({ tag }) {
  return (
    <div className="titlebar">
      <span className="brand">Glowtide{tag && <span className="tag">{tag}</span>}</span>
      <div className="winbtns">
        <button aria-label="Minimise" onClick={() => api.windowAction('minimize')}>
          <Minus size={14} />
        </button>
        <button aria-label="Hide to tray" onClick={() => api.windowAction('close')}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

function NowPlaying({ state, settings, lyrics, setPanel }) {
  const { track, playback } = state
  const pos = usePosition(playback, track?.durationMs, 250)
  const [drag, setDrag] = useState(null)
  const playing = !!playback?.isPlaying
  const repeatNext = { off: 'context', context: 'track', track: 'off' }[playback?.repeat || 'off']
  const synced = state.lyricsStatus === 'synced' && lyrics.length > 0
  const yt = state.source === 'youtube'
  // Free Spotify: Spotify won't take remote control, so Glowtide follows along instead.
  const followOnly = state.source === 'spotify' && state.spotifyPlan === 'free'
  const sys = state.source === 'system'
  const noDevices = yt || state.source === 'demo'
  // "Any app": each app decides which controls it accepts from outside.
  const can = (action) => (followOnly ? false : sys ? !!state.caps?.[action] : true)
  const noControls =
    sys &&
    state.track &&
    !['play', 'pause', 'next', 'previous', 'seek'].some((a) => state.caps?.[a])

  let lyricNote = LYRIC_STATUS[state.lyricsStatus] || ''
  if (yt && state.lyricsStatus === 'synced')
    lyricNote = 'Lyrics matched by title · nudge if the video runs early or late'

  return (
    <div className="np">
      {track?.cover && <img className="backdrop" src={track.cover} alt="" />}
      <div className="np-main">
        {yt ? (
          <YouTubeStage state={state} onOpenLibrary={() => setPanel('library')} />
        ) : track?.cover ? (
          <img className="cover" src={track.cover} alt={`${track.album || track.name} cover`} />
        ) : (
          <div className="cover placeholder" />
        )}
        {track ? (
          <>
            <div className="title" title={track.rawTitle || track.name}>
              {track.name}
            </div>
            <div className="artist" title={track.artists}>
              {track.artists}
            </div>
            <div className="seek">
              <span>{fmtTime(drag ?? pos)}</span>
              <input
                type="range"
                min={0}
                max={track.durationMs || 1}
                value={drag ?? pos}
                disabled={!can('seek')}
                onChange={(e) => setDrag(Number(e.target.value))}
                onPointerUp={() => {
                  if (drag != null) api.control('seek', drag)
                  setDrag(null)
                }}
                style={{ '--p': `${((drag ?? pos) / (track.durationMs || 1)) * 100}%` }}
                aria-label="Seek"
              />
              <span>{fmtTime(track.durationMs)}</span>
            </div>
          </>
        ) : (
          <div className="empty">
            <div className="title">Nothing playing</div>
            <div className="artist">
              {sys
                ? 'Play music in Spotify, your browser or any music app.'
                : yt
                  ? 'Open your library, search, or paste a YouTube Music link.'
                  : 'Start something in Spotify, or pick from your library.'}
            </div>
          </div>
        )}

        <div className="controls">
          <button
            className={`rd ${playback?.shuffle ? 'on' : ''}`}
            aria-label="Shuffle"
            disabled={!can('shuffle')}
            onClick={() => api.control('shuffle', !playback?.shuffle)}
          >
            <Shuffle size={15} />
          </button>
          <button
            className="rd"
            aria-label="Previous"
            disabled={!can('previous')}
            onClick={() => api.control('previous')}
          >
            <SkipBack size={16} />
          </button>
          <button
            className="rd big"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!can(playing ? 'pause' : 'play')}
            onClick={() => api.control(playing ? 'pause' : 'play')}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            className="rd"
            aria-label="Next"
            disabled={!can('next')}
            onClick={() => api.control('next')}
          >
            <SkipForward size={16} />
          </button>
          <button
            className={`rd ${playback?.repeat && playback.repeat !== 'off' ? 'on' : ''}`}
            aria-label="Repeat"
            disabled={!can('repeat')}
            onClick={() => api.control('repeat', repeatNext)}
          >
            {playback?.repeat === 'track' ? <Repeat1 size={15} /> : <Repeat size={15} />}
          </button>
        </div>
        {noControls && (
          <div className="status">
            {state.systemApp?.label} doesn’t accept controls from other apps. Glowtide follows along.
          </div>
        )}
        {followOnly && (
          <div className="status">
            Free Spotify account: play and skip in Spotify, Glowtide follows along.
          </div>
        )}

        <div className="lyric-row">
          <button
            className={`pill ${settings.lyrics.overlay ? 'on' : ''}`}
            onClick={() => api.setSettings({ lyrics: { overlay: !settings.lyrics.overlay } })}
          >
            <MicVocal size={13} /> Lyrics
          </button>
          {synced && (
            <div className="nudge" title="Lyrics early or late? Nudge them for this song.">
              <button
                className="rd sm"
                aria-label="Lyrics earlier"
                onClick={() => api.nudgeLyrics(-250)}
              >
                −
              </button>
              <span onDoubleClick={() => api.nudgeLyrics(0)}>
                {state.lyricsOffsetMs === 0
                  ? 'in sync'
                  : `${state.lyricsOffsetMs > 0 ? '+' : ''}${(state.lyricsOffsetMs / 1000).toFixed(2)}s`}
              </span>
              <button
                className="rd sm"
                aria-label="Lyrics later"
                onClick={() => api.nudgeLyrics(250)}
              >
                +
              </button>
            </div>
          )}
        </div>
        {track && <div className="status">{lyricNote}</div>}
        {state.error && <div className="error">{state.error}</div>}
      </div>

      <div className="dock">
        <button
          className={`rd ${state.liked ? 'on' : ''}`}
          aria-label={state.liked ? 'Remove from liked songs' : 'Save to liked songs'}
          disabled={state.source !== 'spotify' || state.liked == null}
          onClick={() => api.control('like', !state.liked)}
        >
          <Heart size={15} fill={state.liked ? 'currentColor' : 'none'} />
        </button>
        <button className="rd" aria-label="Queue" onClick={() => setPanel('queue')}>
          <ListMusic size={15} />
        </button>
        <button className="rd" aria-label="Search" onClick={() => setPanel('search')}>
          <Search size={15} />
        </button>
        <button className="pill" onClick={() => setPanel('settings')}>
          <Cog size={13} /> Settings
        </button>
        <button
          className="rd"
          aria-label="Devices"
          disabled={noDevices}
          onClick={() => setPanel(sys ? 'apps' : 'devices')}
        >
          <MonitorSpeaker size={15} />
        </button>
        <button
          className={`rd ${settings.glow.enabled ? 'on' : ''}`}
          aria-label="Edge glow"
          onClick={() => api.setSettings({ glow: { enabled: !settings.glow.enabled } })}
        >
          <SunMedium size={15} />
        </button>
        <button className="rd" aria-label="Library" onClick={() => setPanel('library')}>
          <Library size={15} />
        </button>
      </div>
    </div>
  )
}

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span>{title}</span>
          <button className="rd sm" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

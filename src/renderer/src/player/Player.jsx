import { useEffect, useRef, useState } from 'react'
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
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  RotateCw,
  Lightbulb,
  Monitor,
  History,
  MonitorUp,
  Check,
  Disc3,
  Expand,
  ImageIcon
} from 'lucide-react'
import { api, fmtTime, useColours, useDisplays, useGlowtide, usePosition } from '../lib/store'
import { lineIndexAt } from '../../../shared/lyrics.mjs'
import { Messages } from '../overlays/Messages'
import { messagesView } from '../overlays/messagesView'
import { glowAnimation } from '../../../shared/glow.mjs'
import { ANIMATION_OPTIONS, GRADIENTS } from './glowOptions'
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
  const [lyricsView, toggleLyricsView] = useLyricsView()
  const [immersiveOn, setImmersive] = useImmersive()

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
      className={`player ${fade} ${state.playerMaximized ? 'max' : ''} ${settings.hints === false ? 'no-hints' : ''}`}
      style={{
        '--glow': colours.glow,
        '--lyr': colours.lyrics,
        '--hi': colours.highlight,
        '--hi-text': colours.highlightText
      }}
    >
      <TitleBar
        tag={screen === 'player' ? tag : null}
        maximized={state.playerMaximized}
        update={state.update}
      />
      {screen === 'welcome' && <Welcome state={state} setPanel={setPanel} />}
      {screen === 'spotify-setup' && (
        <Connect state={state} settings={settings} onBack={() => api.setSource(null)} />
      )}
      {screen === 'player' && (
        <div className="shell">
          <Sidebar state={state} panel={panel} setPanel={setPanel} />
          <main className="main">
            <NowPlaying
              state={state}
              settings={settings}
              lyrics={lyrics}
              setPanel={setPanel}
              lyricsView={lyricsView}
              immersiveOn={immersiveOn}
              setImmersive={setImmersive}
            />
            {/* Pages belong to the player screen: never over Welcome or Connect Spotify. */}
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
                {panel === 'settings' && (
                  <SettingsPanel state={state} settings={settings} onClose={() => setPanel(null)} />
                )}
              </Sheet>
            )}
          </main>
          <Rail
            state={state}
            settings={settings}
            lyricsView={lyricsView}
            toggleLyricsView={() => {
              setPanel(null)
              toggleLyricsView()
            }}
            immersive={immersiveOn}
            setImmersive={(v) => {
              setPanel(null)
              setImmersive(v)
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Left: where you go. The page being shown is lit; Now playing closes any page. Names show
 * beside the icons when the window is wide enough.
 */
function Sidebar({ state, panel, setPanel }) {
  const sys = state.source === 'system'
  const noDevices = state.source === 'youtube' || state.source === 'demo'
  const items = [
    [null, 'Now playing', Disc3, 'Now playing · the song and its controls'],
    ['library', 'Library', Library, 'Library · your playlists and saved music'],
    ['search', 'Search', Search, 'Search · find a song'],
    ['queue', 'Queue', ListMusic, 'Queue · what plays next'],
    sys
      ? ['apps', 'Apps', MonitorSpeaker, 'Apps · which app Glowtide follows']
      : ['devices', 'Devices', MonitorSpeaker, 'Devices · where the music plays']
  ]
  const item = ([key, label, Icon, tip], disabled = false) => (
    <button
      key={label}
      className={`side-item ${panel === key ? 'on' : ''}`}
      aria-label={label}
      aria-current={panel === key ? 'page' : undefined}
      data-tip={tip}
      data-tip-pos="right"
      disabled={disabled}
      onClick={() => setPanel(key)}
    >
      <Icon size={16} />
      <span className="side-label">{label}</span>
    </button>
  )
  return (
    <nav className="sidebar" aria-label="Glowtide">
      {items.map((it) => item(it, (it[0] === 'devices' || it[0] === 'apps') && noDevices))}
      <span className="side-gap" />
      {item(['settings', 'Settings', Cog, 'Settings · glow, lyrics, colours and more'])}
    </nav>
  )
}

/** Right: what you see. Lyrics here, lyrics on the desktop, the glow, the cover, full screen. */
function Rail({ state, settings, lyricsView, toggleLyricsView, immersive, setImmersive }) {
  const yt = state.source === 'youtube'
  const overlay = settings.lyrics.overlay
  return (
    <aside className="rail" aria-label="View">
      <button
        className={`rd ${lyricsView && !yt ? 'on' : ''}`}
        aria-label="Lyrics in this window"
        aria-pressed={lyricsView && !yt}
        data-tip="Lyrics · show them in this window"
        data-tip-pos="left"
        disabled={yt}
        onClick={toggleLyricsView}
      >
        <MicVocal size={16} />
      </button>
      <button
        className={`rd ${overlay ? 'on' : ''}`}
        aria-label="Lyrics on the desktop"
        aria-pressed={overlay}
        data-tip={`Desktop lyrics · over everything on your screen (${overlay ? 'on' : 'off'})`}
        data-tip-pos="left"
        onClick={() => api.setSettings({ lyrics: { overlay: !overlay } })}
      >
        <MonitorUp size={16} />
      </button>
      <GlowPanel settings={settings} />
      <button
        className={`rd ${immersive && !yt ? 'on' : ''}`}
        aria-label="Fill the window with the cover"
        aria-pressed={immersive && !yt}
        data-tip="Cover · fill this window with it"
        data-tip-pos="left"
        disabled={yt || !state.track?.cover}
        onClick={() => setImmersive(!immersive)}
      >
        <ImageIcon size={16} />
      </button>
      <button
        className="rd"
        aria-label="Full screen"
        data-tip="Full screen · cover and visualizer (Ctrl+Alt+F)"
        data-tip-pos="left"
        onClick={() => api.stage('open')}
      >
        <Expand size={16} />
      </button>
    </aside>
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

function TitleBar({ tag, maximized, update }) {
  return (
    <div className="titlebar">
      <span className="brand">Glowtide{tag && <span className="tag">{tag}</span>}</span>
      <div className="winbtns">
        {update?.status === 'ready' && (
          <button
            className="update-ready"
            title={`Glowtide ${update.version} is downloaded. Restart to install it.`}
            onClick={() => api.installUpdate()}
          >
            Restart to update
          </button>
        )}
        <button aria-label="Minimise" onClick={() => api.windowAction('minimize')}>
          <Minus size={14} />
        </button>
        <button
          aria-label={maximized ? 'Restore' : 'Maximise'}
          title={maximized ? 'Restore (F11 for full screen)' : 'Maximise (F11 for full screen)'}
          onClick={() => api.windowAction('maximize')}
        >
          {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button aria-label="Hide to tray" onClick={() => api.windowAction('close')}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

const SKIP_MS = 15000

/** Remembered per window: whether the player shows the lyrics beside the controls. */
function useLyricsView() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem('lyricsView') === '1'
    } catch {
      return false
    }
  })
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem('lyricsView', v ? '0' : '1')
      } catch {
        /* remembering is optional */
      }
      return !v
    })
  return [on, toggle]
}

/** Remembered per window: whether the cover fills the player window. */
function useImmersive() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem('immersive') === '1'
    } catch {
      return false
    }
  })
  const set = (v) => {
    try {
      localStorage.setItem('immersive', v ? '1' : '0')
    } catch {
      /* remembering is optional */
    }
    setOn(v)
  }
  return [on, set]
}

/** "15" inside a turning arrow: back or forward fifteen seconds. */
function Skip15({ back }) {
  const Icon = back ? RotateCcw : RotateCw
  return (
    <span className="skip15">
      <Icon size={20} strokeWidth={1.6} />
      <b>15</b>
    </span>
  )
}

function NowPlaying({ state, settings, lyrics, setPanel, lyricsView, immersiveOn, setImmersive }) {
  const { track, playback } = state
  const pos = usePosition(playback, track?.durationMs, 250)
  const [drag, setDrag] = useState(null)
  const [artBig, setArtBig] = useState(false)
  const playing = !!playback?.isPlaying
  const repeatNext = { off: 'context', context: 'track', track: 'off' }[playback?.repeat || 'off']
  const synced = state.lyricsStatus === 'synced' && lyrics.length > 0
  const yt = state.source === 'youtube'
  // Free Spotify: Spotify won't take remote control, so Glowtide follows along instead.
  const followOnly = state.source === 'spotify' && state.spotifyPlan === 'free'
  const sys = state.source === 'system'
  // "Any app": each app decides which controls it accepts from outside.
  const can = (action) => (followOnly ? false : sys ? !!state.caps?.[action] : true)
  const noControls =
    sys &&
    state.track &&
    !['play', 'pause', 'next', 'previous', 'seek'].some((a) => state.caps?.[a])

  let lyricNote = LYRIC_STATUS[state.lyricsStatus] || ''
  if (state.lyricsStatus === 'synced' && state.lyricsTiming === 'word')
    lyricNote = `Word-timed lyrics · ${state.lyricsSource}`
  else if (state.lyricsStatus === 'synced' && settings.lyrics.estimated !== 'words')
    lyricNote = `Synced lyrics · line by line${state.lyricsSource ? ` · ${state.lyricsSource}` : ''}`
  if (yt && state.lyricsStatus === 'synced')
    lyricNote += ' · matched by title, nudge if the video runs early or late'

  const skip = (delta) =>
    api.control(
      'seek',
      Math.max(0, Math.min((track?.durationMs || 0) - 1000, positionNow(playback, pos) + delta))
    )
  const canSkip = !!track && can('seek') && !!track.durationMs
  const open = lyricsView && !yt
  // The cover fills the window (click it; click it again or press Esc to shrink it back).
  const immersive = immersiveOn && !open && !yt && !!track?.cover

  return (
    <div
      className={`np ${artBig && !open && !immersive ? 'art-big' : ''} ${open ? 'lyrics-open' : ''} ${immersive ? 'immersive' : ''}`}
    >
      {track?.cover && <img className="backdrop" src={track.cover} alt="" />}
      <div className="art-tint" />
      {track?.cover && !yt && !open && (
        <div
          className={`immersive-art ${playing ? 'moving' : ''}`}
          title="Click, or press Esc, to shrink the cover"
          onClick={() => setImmersive(false)}
        >
          <img src={track.cover} alt="" />
        </div>
      )}
      {immersive && <EscToLeave onLeave={() => setImmersive(false)} />}
      {immersive && synced && settings.lyrics.style === 'messages' && (
        <PlayerMessages
          lines={lyrics}
          playback={playback}
          durationMs={track?.durationMs}
          offsetMs={state.lyricsOffsetMs}
          track={track}
        />
      )}
      <div className="np-main">
        <div className="np-card">
          <div className="np-left">
            {yt ? (
              <YouTubeStage state={state} onOpenLibrary={() => setPanel('library')} />
            ) : track?.cover ? (
              <div
                className={`cover ${playing ? 'moving' : ''}`}
                role="button"
                tabIndex={0}
                aria-label="Fill the window with the cover"
                title="Click to fill the window"
                onMouseEnter={() => setArtBig(true)}
                onMouseLeave={() => setArtBig(false)}
                onClick={() => {
                  setArtBig(false)
                  if (!open) setImmersive(true)
                }}
                onKeyDown={(e) =>
                  (e.key === 'Enter' || e.key === ' ') && !open && setImmersive(true)
                }
              >
                <img src={track.cover} alt={`${track.album || track.name} cover`} />
              </div>
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
                data-tip={playback?.shuffle ? 'Shuffle · on' : 'Shuffle · play in any order'}
                disabled={!can('shuffle')}
                onClick={() => api.control('shuffle', !playback?.shuffle)}
              >
                <Shuffle size={15} />
              </button>
              <button
                className="rd"
                aria-label="Previous"
                data-tip="Previous · the song before"
                disabled={!can('previous')}
                onClick={() => api.control('previous')}
              >
                <SkipBack size={16} />
              </button>
              <button
                className="rd big"
                aria-label={playing ? 'Pause' : 'Play'}
                data-tip={playing ? 'Pause' : 'Play'}
                disabled={!can(playing ? 'pause' : 'play')}
                onClick={() => api.control(playing ? 'pause' : 'play')}
              >
                {playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                className="rd"
                aria-label="Next"
                data-tip="Next · skip to the next song"
                disabled={!can('next')}
                onClick={() => api.control('next')}
              >
                <SkipForward size={16} />
              </button>
              <button
                className={`rd ${playback?.repeat && playback.repeat !== 'off' ? 'on' : ''}`}
                aria-label="Repeat"
                data-tip={
                  {
                    off: 'Repeat · off',
                    context: 'Repeat · the whole list',
                    track: 'Repeat · this song'
                  }[playback?.repeat || 'off']
                }
                disabled={!can('repeat')}
                onClick={() => api.control('repeat', repeatNext)}
              >
                {playback?.repeat === 'track' ? <Repeat1 size={15} /> : <Repeat size={15} />}
              </button>
            </div>
            {noControls && (
              <div className="status">
                {state.systemApp?.label} doesn’t accept controls from other apps. Glowtide follows
                along.
              </div>
            )}
            {followOnly && (
              <div className="status">
                Free Spotify account: play and skip in Spotify, Glowtide follows along.
              </div>
            )}

            <div className="lyric-row">
              {synced && (
                <div
                  className={`sync-xp ${state.lyricsOffsetMs ? 'moved' : ''}`}
                  data-tip="Sync · lyrics early or late? Nudge them"
                >
                  <span className="rd sync-icon" aria-hidden="true">
                    <History size={15} />
                  </span>
                  <div className="sync-body">
                    <button
                      className="rd sm ghost"
                      aria-label="Lyrics earlier"
                      onClick={() => api.nudgeLyrics(-250)}
                    >
                      −
                    </button>
                    <span onDoubleClick={() => api.nudgeLyrics(0)}>
                      {state.lyricsOffsetMs === 0
                        ? 'Sync'
                        : `${state.lyricsOffsetMs > 0 ? '+' : ''}${(state.lyricsOffsetMs / 1000).toFixed(2)}s`}
                    </span>
                    <button
                      className="rd sm ghost"
                      aria-label="Lyrics later"
                      onClick={() => api.nudgeLyrics(250)}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
            {track && <div className="status">{lyricNote}</div>}
            {state.error && <div className="error">{state.error}</div>}
          </div>
          {open && (
            <PlayerLyrics
              lines={lyrics}
              synced={synced}
              note={track ? LYRIC_STATUS[state.lyricsStatus] : 'Nothing playing'}
              playback={playback}
              durationMs={track?.durationMs}
              offsetMs={state.lyricsOffsetMs}
            />
          )}
        </div>
      </div>

      <div className="dock">
        <div className="dock-group">
          <button
            className="rd"
            aria-label="Back 15 seconds"
            data-tip="Back 15 seconds"
            disabled={!canSkip}
            onClick={() => skip(-SKIP_MS)}
          >
            <Skip15 back />
          </button>
          <button
            className={`rd ${state.liked ? 'on' : ''}`}
            aria-label={state.liked ? 'Remove from liked songs' : 'Save to liked songs'}
            data-tip={
              state.source !== 'spotify'
                ? 'Like · with Spotify connected'
                : state.liked
                  ? 'Liked · click to remove'
                  : 'Like · save to your liked songs'
            }
            disabled={state.source !== 'spotify' || state.liked == null}
            onClick={() => api.control('like', !state.liked)}
          >
            <Heart size={15} fill={state.liked ? 'currentColor' : 'none'} />
          </button>
          <button
            className="rd"
            aria-label="Forward 15 seconds"
            data-tip="Forward 15 seconds"
            disabled={!canSkip}
            onClick={() => skip(SKIP_MS)}
          >
            <Skip15 />
          </button>
        </div>
      </div>
    </div>
  )
}

/** The lyrics as messages over the full-window cover, word by word. */
function PlayerMessages({ lines, playback, durationMs, offsetMs, track }) {
  const pos = usePosition(playback, durationMs, 80) + (offsetMs || 0)
  return (
    <div className="np-msgs">
      <Messages view={messagesView(lines, pos)} track={track} />
    </div>
  )
}

/** Esc shrinks the full-window cover back (while it's open). */
function EscToLeave({ onLeave }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onLeave()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onLeave])
  return null
}

/** The playback position right now (the interval-updated one can be up to 250 ms old). */
function positionNow(playback, fallback) {
  if (!playback) return fallback
  return playback.isPlaying ? playback.progressMs + (Date.now() - playback.at) : playback.progressMs
}

/** The song's lyrics inside the player, the current line centred and the list following it. */
function PlayerLyrics({ lines, synced, note, playback, durationMs, offsetMs }) {
  const pos = usePosition(playback, durationMs, 200) + (offsetMs || 0)
  const idx = synced ? lineIndexAt(lines, pos) : -1
  const list = useRef(null)
  useEffect(() => {
    const box = list.current
    const el = box?.querySelector('.pl-line.cur')
    if (!box || !el) return
    box.scrollTo({
      top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2,
      behavior: 'smooth'
    })
  }, [idx])
  if (!synced)
    return (
      <div className="pl-lyrics empty">
        <span>{note || 'No lyrics for this song'}</span>
      </div>
    )
  return (
    <div className="pl-lyrics" ref={list}>
      <div className="pl-pad" />
      {lines.map((l, i) =>
        l.text && l.text.trim() ? (
          <div
            key={i}
            className={`pl-line ${i === idx ? 'cur' : i < idx ? 'past' : ''} ${Math.abs(i - idx) > 3 ? 'far' : ''}`}
          >
            {l.text}
          </div>
        ) : (
          <div key={i} className={`pl-gap ${i === idx ? 'cur' : ''}`}>
            ♪
          </div>
        )
      )}
      <div className="pl-pad" />
    </div>
  )
}

/**
 * A button that opens a small panel while the pointer is over it (or it has keyboard
 * focus): above the dock, or (side) to the left of the rail.
 */
function Quick({ icon, label, on, onClick, children, wide, side }) {
  return (
    <div className={`qx ${wide ? 'wide' : ''} ${side ? 'side' : ''}`}>
      <button
        className={`rd ${on ? 'on' : ''}`}
        aria-label={label}
        aria-haspopup="true"
        onClick={onClick}
      >
        {icon}
      </button>
      <div className="qx-pop" role="group" aria-label={label}>
        <div className="qx-in">
          <span className="qx-title">{label}</span>
          {children}
        </div>
      </div>
    </div>
  )
}

function QSeg({ value, options, onChange }) {
  return (
    <div className="qseg">
      {options.map(([k, text]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/**
 * The glow button on the rail: a click turns the glow on or off; resting the pointer on it
 * opens every glow choice in one panel.
 */
function GlowPanel({ settings }) {
  const displays = useDisplays()
  const g = settings.glow
  const set = (patch) => api.setSettings({ glow: patch })
  const choices = [
    ['all', 'All displays'],
    ['primary', 'Main display'],
    ...(displays.length > 1 ? displays.map((d) => [d.id, d.label]) : [])
  ]
  return (
    <Quick
      icon={<Lightbulb size={16} />}
      label="Edge glow"
      on={g.enabled}
      onClick={() => set({ enabled: !g.enabled })}
      side
    >
      <span className="qx-note">Click the bulb to turn the glow {g.enabled ? 'off' : 'on'}.</span>
      <QSeg
        value={g.gradient === 2 ? 2 : 1}
        options={GRADIENTS}
        onChange={(v) => set({ gradient: v })}
      />
      <QSeg
        value={glowAnimation(g)}
        options={ANIMATION_OPTIONS}
        onChange={(v) => set({ animation: v })}
      />
      <div className="qslide">
        <span className="qx-note">Brightness</span>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={g.intensity}
          aria-label="Glow brightness"
          style={{ '--p': `${((g.intensity - 10) / 90) * 100}%` }}
          onChange={(e) => set({ intensity: Number(e.target.value), enabled: true })}
        />
      </div>
      <QSeg
        value={g.taskbar ? 'on' : 'off'}
        options={[
          ['on', 'Clear of the taskbar'],
          ['off', 'Behind it']
        ]}
        onChange={(v) => set({ taskbar: v === 'on' })}
      />
      <div className="qlist">
        {choices.map(([k, text]) => (
          <button
            key={k}
            className={String(g.displays) === String(k) ? 'on' : ''}
            onClick={() => set({ displays: k })}
          >
            <Monitor size={13} /> <span>{text}</span>
            {String(g.displays) === String(k) && <Check size={13} />}
          </button>
        ))}
      </div>
    </Quick>
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
          <button
            className="rd sm"
            aria-label="Back to now playing"
            data-tip="Back to now playing"
            data-tip-pos="left"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  ImageIcon,
  Share2,
  ChartColumn
} from 'lucide-react'
import { api, fmtTime, useColours, useDisplays, useGlowtide, usePosition } from '../lib/store'
import { lineIndexAt } from '../../../shared/lyrics.mjs'
import {
  tapTargets,
  tap,
  undoTap,
  timedLines,
  wordTargets,
  wordTimedLines
} from '../../../shared/tapsync.mjs'
import { drawCard, CARD_SIZES, recordClip } from './shareCard'
import { Messages } from '../overlays/Messages'
import { Wallpaper } from '../lib/Backgrounds'
import { messagesView } from '../overlays/messagesView'
import { glowAnimation } from '../../../shared/glow.mjs'
import { ANIMATION_OPTIONS, GRADIENTS } from './glowOptions'
import Welcome from './Welcome'
import Tour from './Tour'
import { Seg } from './SettingsPanel'
import Connect from './Connect'
import SettingsPanel from './SettingsPanel'
import StatsPanel from './StatsPanel'
import YouTubeStage from './YouTubeStage'
import { SearchPanel, LibraryPanel, QueuePanel, DevicesPanel } from './Panels'
import { YtSearch, YtLibrary, YtQueue } from './YtPanels'
import { SystemInfo, SystemApps } from './SystemPanels'

const LYRIC_STATUS = {
  loading: 'Looking for lyrics…',
  synced: 'Synced lyrics · word timing estimated',
  plain: 'Lyrics without timing · read them in the window; the desktop overlay stays off',
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
  // a page asked for from outside the window (the weekly recap opens Stats)
  useEffect(() => api.onOpenPanel((p) => ['stats'].includes(p) && setPanel(p)), [])
  const [lyricsView, toggleLyricsView] = useLyricsView()
  const [immersiveOn, setImmersive] = useImmersive()
  usePlayerKeys(state)

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
        '--hi-text': colours.highlightText,
        '--space': (settings.lyrics.spacing || 100) / 100
      }}
    >
      {screen === 'player' && !settings.tourDone && <Tour settings={settings} />}
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
          <main className={`main ${panel ? 'has-page' : ''}`}>
            <NowPlaying
              state={state}
              settings={settings}
              lyrics={lyrics}
              setPanel={setPanel}
              lyricsView={lyricsView}
              immersiveOn={immersiveOn}
              setImmersive={setImmersive}
              pageOpen={!!panel}
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
                {panel === 'stats' && <StatsPanel state={state} settings={settings} />}
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
              if (!lyricsView && immersiveOn) setImmersive(false)
              toggleLyricsView()
            }}
            immersive={immersiveOn && !lyricsView}
            setImmersive={(v) => {
              setPanel(null)
              if (v && lyricsView) toggleLyricsView()
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
      {item(['stats', 'Stats', ChartColumn, 'Stats · what you listen to most'])}
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
  stats: 'Your listening',
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

function NowPlaying({
  state,
  settings,
  lyrics,
  setPanel,
  lyricsView,
  immersiveOn,
  setImmersive,
  pageOpen
}) {
  const { track, playback } = state
  const colours = useColours(state, settings)
  const bg = settings.background
  const pos = usePosition(playback, track?.durationMs, 250)
  const [drag, setDrag] = useState(null)
  const [artBig, setArtBig] = useState(false)
  // Tap-to-sync in the lyrics view; a new song ends it.
  const [syncing, setSyncing] = useState(false) // false | 'lines' | 'words'
  const [carding, setCarding] = useState(false)
  const [syncFor, setSyncFor] = useState(track?.id)
  if (syncFor !== track?.id) {
    setSyncFor(track?.id)
    setSyncing(false)
    setCarding(false)
  }
  const endSync = useCallback(() => setSyncing(false), [])
  const [picking, setPicking] = useState(false)
  const [pickFor, setPickFor] = useState(track?.id)
  if (pickFor !== track?.id) {
    setPickFor(track?.id)
    setPicking(false)
  }
  const endPick = useCallback(() => setPicking(false), [])
  const playing = !!playback?.isPlaying
  const repeatNext = { off: 'context', context: 'track', track: 'off' }[playback?.repeat || 'off']
  const synced = state.lyricsStatus === 'synced' && lyrics.length > 0
  const yt = state.source === 'youtube'
  // Free Spotify: Spotify won't take remote control, so Glowtide follows along instead.
  const followOnly = state.source === 'spotify' && state.spotifyPlan === 'free'
  const sys = state.source === 'system'
  // "Any app": each app decides which controls it accepts from outside.
  // Any app following Spotify's app, with Spotify connected: its Web API covers what the app
  // turns down (seeking, above all)
  const can = (action) =>
    followOnly
      ? false
      : sys
        ? !!state.caps?.[action] ||
          (!!state.spotifyBridge &&
            ['play', 'pause', 'next', 'previous', 'seek', 'shuffle', 'repeat'].includes(action))
        : true
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
      {bg?.kind && bg.kind !== 'cover' ? (
        <Wallpaper bg={bg} colours={colours} className="np-wall" />
      ) : (
        track?.cover && <img className="backdrop" src={track.coverSoft || track.cover} alt="" />
      )}
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
      {immersive && !pageOpen && <EscToLeave onLeave={() => setImmersive(false)} />}
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
                  data-tip="Sync · 50 ms a click, Shift for 0.5 s, [ and ] keys too (double-click resets)"
                >
                  <span className="rd sync-icon" aria-hidden="true">
                    <History size={15} />
                  </span>
                  <div className="sync-body">
                    <button
                      className="rd sm ghost"
                      aria-label="Lyrics earlier"
                      onClick={(e) => api.nudgeLyrics(e.shiftKey ? -500 : -50)}
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
                      onClick={(e) => api.nudgeLyrics(e.shiftKey ? 500 : 50)}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
            {synced && track && state.timingHint?.trackId === track.id && (
              <TimingHint hint={state.timingHint} current={state.lyricsOffsetMs} />
            )}
            {track && <div className="status">{lyricNote}</div>}
            {open && track && !syncing && !picking && !carding && (
              <LyricTools
                key={track.id}
                plain={state.lyricsStatus === 'plain' && lyrics.length > 0}
                synced={synced}
                wordTimed={state.lyricsTiming === 'word'}
                mine={state.lyricsSource === 'Timed by you'}
                trackId={track.id}
                onTime={() => setSyncing('lines')}
                onTimeWords={() => setSyncing('words')}
                onPick={() => setPicking(true)}
                onCard={() => setCarding(true)}
              />
            )}
            {state.error && <div className="error">{state.error}</div>}
            {state.ytFinding && !state.error && (
              <div className="finding" role="status">
                Finding a version of this song that plays…
              </div>
            )}
          </div>
          {open && synced && settings.lyrics.style === 'messages' ? (
            <div className="pl-lyrics pl-msgs">
              <PlayerMessages
                lines={lyrics}
                playback={playback}
                durationMs={track?.durationMs}
                offsetMs={state.lyricsOffsetMs}
                track={track}
                bare
              />
            </div>
          ) : (
            open && (
              <PlayerLyrics
                lines={lyrics}
                synced={synced}
                plain={state.lyricsStatus === 'plain' && lyrics.length > 0}
                syncing={syncing}
                endSync={endSync}
                picking={picking}
                endPick={endPick}
                carding={carding}
                endCard={() => setCarding(false)}
                track={track}
                chosen={state.lyricsChosen}
                canSeek={can('seek')}
                canStar={state.source !== 'demo'}
                pageOpen={pageOpen}
                trackId={track?.id}
                note={track ? LYRIC_STATUS[state.lyricsStatus] : 'Nothing playing'}
                playback={playback}
                durationMs={track?.durationMs}
                offsetMs={state.lyricsOffsetMs}
              />
            )
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
          <ShareButton disabled={!track} />
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

/**
 * The lyrics as messages, word by word: over the full-window cover, or (bare) in the
 * lyrics view, in place of the list.
 */
function PlayerMessages({ lines, playback, durationMs, offsetMs, track, bare }) {
  const pos = usePosition(playback, durationMs, 80) + (offsetMs || 0)
  const view = <Messages view={messagesView(lines, pos)} track={track} />
  return bare ? view : <div className="np-msgs">{view}</div>
}

/** Copies the song and its link (Spotify, YouTube Music) to paste anywhere. */
function ShareButton({ disabled }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(id)
  }, [copied])
  return (
    <button
      className={`rd ${copied ? 'on' : ''}`}
      aria-label="Copy the song and its link"
      data-tip={copied ? 'Copied' : 'Share · copy the song and its link'}
      disabled={disabled}
      onClick={async () => setCopied(!!(await api.share()))}
    >
      {copied ? <Check size={15} /> : <Share2 size={15} />}
    </button>
  )
}

/**
 * Keys in the player: Space play/pause, Ctrl+← → previous/next, Shift+← → 15 s back or
 * forward, [ ] lyrics 50 ms earlier/later (Shift: 0.5 s), L like. Not while typing, and not
 * when something else (tap-to-sync, a focused button) has the key.
 */
/** The timing check heard the lyrics running early or late: offer the nudge. */
function TimingHint({ hint, current }) {
  const diff = hint.offsetMs - current
  const secs = (Math.abs(diff) / 1000).toFixed(1)
  return (
    <div className="timing-hint" role="status">
      <span>
        The lyrics look {secs} s {diff < 0 ? 'early' : 'late'} against the singing.
      </span>
      <button
        className="pill on"
        onClick={async () => {
          await api.nudgeLyrics(diff)
          api.dismissTiming()
        }}
      >
        Fix it
      </button>
      <button className="pill" onClick={() => api.dismissTiming()}>
        No thanks
      </button>
    </div>
  )
}

function usePlayerKeys(state) {
  const live = useRef(state)
  useEffect(() => {
    live.current = state
  })
  useEffect(() => {
    const k = (e) => {
      const s = live.current
      const t = e.target
      if (!s || e.defaultPrevented || e.repeat || e.altKey || e.metaKey) return
      if (document.querySelector('.pl-lyrics.tap')) return // tap-to-sync has the keys
      if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t?.tagName)) return
      const pb = s.playback
      const pos = pb ? (pb.isPlaying ? pb.progressMs + (Date.now() - pb.at) : pb.progressMs) : 0
      if (e.key === ' ' && !e.ctrlKey) api.control(pb?.isPlaying ? 'pause' : 'play')
      else if (e.key === 'ArrowRight' && e.ctrlKey) api.control('next')
      else if (e.key === 'ArrowLeft' && e.ctrlKey) api.control('previous')
      else if (e.key === 'ArrowRight' && e.shiftKey) api.control('seek', pos + SKIP_MS)
      else if (e.key === 'ArrowLeft' && e.shiftKey) api.control('seek', Math.max(0, pos - SKIP_MS))
      else if (e.code === 'BracketLeft' && !e.ctrlKey) api.nudgeLyrics(e.shiftKey ? -500 : -50)
      else if (e.code === 'BracketRight' && !e.ctrlKey) api.nudgeLyrics(e.shiftKey ? 500 : 50)
      else if (e.key.toLowerCase() === 'l' && !e.ctrlKey && s.liked != null)
        api.control('like', !s.liked)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
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
function PlayerLyrics({
  lines,
  synced,
  plain,
  syncing,
  endSync,
  picking,
  endPick,
  carding,
  endCard,
  track,
  chosen,
  canSeek,
  canStar,
  pageOpen,
  trackId,
  note,
  playback,
  durationMs,
  offsetMs
}) {
  const pos = usePosition(playback, durationMs, 200) + (offsetMs || 0)
  const idx = synced ? lineIndexAt(lines, pos) : -1
  const list = useRef(null)
  // Favourite lines: the ones starred in this song
  const [favs, setFavs] = useState({ id: null, texts: [] })
  useEffect(() => {
    let live = true
    api.favsForSong().then((texts) => live && setFavs({ id: trackId, texts: texts || [] }))
    return () => {
      live = false
    }
  }, [trackId])
  const starred = new Set(favs.id === trackId ? favs.texts : [])
  const star = async (text) => {
    const on = await api.toggleFav(text, trackId)
    if (on === null) return
    setFavs((f) => ({
      id: trackId,
      texts: on ? [...f.texts, text.trim()] : f.texts.filter((t) => t !== text.trim())
    }))
  }
  // Tap a line to jump there (the nudge moves where a line sits in the song, so take it off)
  const jump = (l) => canSeek && api.control('seek', Math.max(0, Math.round(l.t - (offsetMs || 0))))
  useEffect(() => {
    const box = list.current
    const el = box?.querySelector('.pl-line.cur')
    if (!box || !el) return
    box.scrollTo({
      top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2,
      behavior: 'smooth'
    })
  }, [idx])
  if (picking) return <VersionPicker track={track} chosen={chosen} onClose={endPick} />
  if (carding) return <ShareCard lines={lines} current={idx} track={track} onClose={endCard} />
  if (syncing === 'words' && synced)
    return (
      <WordSync
        lines={lines}
        playback={playback}
        trackId={trackId}
        canSeek={canSeek}
        paused={pageOpen}
        onClose={endSync}
      />
    )
  if (syncing && (plain || synced))
    return (
      <TapSync
        lines={lines}
        playback={playback}
        trackId={trackId}
        canSeek={canSeek}
        paused={pageOpen}
        onClose={endSync}
      />
    )
  if (!synced && plain)
    return <PlainLyrics lines={lines} playback={playback} durationMs={durationMs} />
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
            className={`pl-line ${i === idx ? 'cur' : i < idx ? 'past' : ''} ${Math.abs(i - idx) > 3 ? 'far' : ''} ${canSeek ? 'seekable' : ''} ${starred.has(l.text.trim()) ? 'starred' : ''}`}
            role={canSeek ? 'button' : undefined}
            tabIndex={canSeek ? 0 : undefined}
            title={canSeek ? 'Play from this line' : undefined}
            onClick={() => jump(l)}
            onKeyDown={(e) => e.key === 'Enter' && jump(l)}
          >
            {l.text}
            {canStar && (
              <button
                className="pl-star"
                aria-label={starred.has(l.text.trim()) ? 'Unstar this line' : 'Star this line'}
                aria-pressed={starred.has(l.text.trim())}
                onClick={(e) => {
                  e.stopPropagation()
                  star(l.text)
                }}
              >
                {starred.has(l.text.trim()) ? '★' : '☆'}
              </button>
            )}
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
 * Under the lyrics status: for untimed lyrics, a way to time them; for lyrics you timed,
 * re-time, export or remove them (removing asks first).
 */
function LyricTools({
  plain,
  synced,
  wordTimed,
  mine,
  trackId,
  onTime,
  onTimeWords,
  onPick,
  onCard
}) {
  const [asking, setAsking] = useState(false)
  const [saved, setSaved] = useState('')
  const [sharing, setSharing] = useState(false)
  const wrong = (
    <button className="pill" onClick={onPick} data-tip="Pick another version of the lyrics">
      Wrong lyrics?
    </button>
  )
  const card = (plain || synced) && (
    <button className="pill" onClick={onCard} data-tip="Make an image of a line, for stories">
      Share a line
    </button>
  )
  const words = synced && !wordTimed && (
    <button
      className="pill"
      onClick={onTimeWords}
      data-tip="Tap each word as it's sung, for karaoke timing"
    >
      Time each word
    </button>
  )
  if (sharing) return <LrclibShare trackId={trackId} onClose={() => setSharing(false)} />
  if (plain)
    return (
      <div className="lyric-tools">
        <button className="pill" onClick={onTime}>
          Time these lyrics
        </button>
        {card}
        {wrong}
      </div>
    )
  if (!mine)
    return (
      <div className="lyric-tools">
        {words}
        {card}
        {wrong}
      </div>
    )
  if (asking)
    return (
      <div className="lyric-tools">
        <span>Remove your timing for this song?</span>
        <button
          className="pill"
          onClick={() => {
            setAsking(false)
            api.removeTimedLyrics()
          }}
        >
          Remove
        </button>
        <button className="pill" onClick={() => setAsking(false)}>
          Keep
        </button>
      </div>
    )
  return (
    <div className="lyric-tools">
      <button className="pill" onClick={onTime}>
        Re-time
      </button>
      {words}
      {card}
      <button
        className="pill"
        onClick={() => setSharing(true)}
        data-tip="Publish your timing to LRCLIB, the free lyrics database"
      >
        Share to LRCLIB
      </button>
      <button
        className="pill"
        onClick={async () => setSaved((await api.exportTimedLyrics()) ? 'Saved' : '')}
      >
        {saved || 'Export .lrc'}
      </button>
      <button className="pill" onClick={() => setAsking(true)}>
        Remove
      </button>
    </div>
  )
}

/**
 * Share your timing to LRCLIB: what will be published, a plain warning that it's public
 * and can't be taken back, and only then Publish.
 */
function LrclibShare({ trackId, onClose }) {
  const [pre, setPre] = useState(null)
  const [stage, setStage] = useState('confirm') // confirm | working | done | failed
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let live = true
    api.sharePreview().then((r) => live && setPre(r))
    return () => {
      live = false
    }
  }, [])
  const publish = async () => {
    setStage('working')
    const r = await api.shareLrclib(trackId)
    if (r?.ok) setStage('done')
    else {
      setMsg(r?.error || 'Something went wrong.')
      setStage('failed')
    }
  }
  const b = pre?.body
  return (
    <div className="lrclib-share">
      {!pre && <div className="fine">Getting it ready…</div>}
      {pre?.error && <div className="fine warn">{pre.error}</div>}
      {b && stage === 'confirm' && (
        <>
          <div className="ls-title">Publish your timing to LRCLIB?</div>
          <div className="ls-what">
            {b.trackName} · {b.artistName} · {b.albumName} · {fmtTime(b.duration * 1000)} ·{' '}
            {b.lines} lines
          </div>
          <div className="fine">
            It becomes public on lrclib.net for every app that uses it, and can’t be removed (LRCLIB
            keeps every version). Only the words and line times are sent.
          </div>
        </>
      )}
      {stage === 'working' && (
        <div className="fine">
          Publishing… LRCLIB asks for a short proof of work first, which takes up to a minute.
        </div>
      )}
      {stage === 'done' && <div className="ls-title">Published. Thank you!</div>}
      {stage === 'failed' && <div className="fine warn">{msg}</div>}
      <div className="lyric-tools">
        {b && stage === 'confirm' && (
          <button className="pill on" onClick={publish}>
            Publish
          </button>
        )}
        <button className="pill" disabled={stage === 'working'} onClick={onClose}>
          {stage === 'done' ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}

/**
 * Word by word: play the song and tap (Space, Enter or a click) as each word starts.
 * Lines whose every word is tapped get word timing (the karaoke fill follows your taps);
 * the others keep their line time, so it can be saved part way through.
 */
function WordSync({ lines, playback, trackId, canSeek, paused, onClose }) {
  const targets = useMemo(() => wordTargets(lines), [lines])
  const [times, setTimes] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const list = useRef(null)
  const next = targets[times.length]
  const timed = useMemo(() => wordTimedLines(lines, times), [lines, times])
  const fullLines = timed.filter((l) => l.words).length
  const doTap = useCallback(
    () => setTimes((t) => tap(t, positionNow(playback, 0), targets.length)),
    [playback, targets.length]
  )
  useEffect(() => {
    const key = (e) => {
      const t = e.target
      if (
        e.repeat ||
        paused ||
        t?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName)
      )
        return
      if (e.key === ' ' || e.key === 'Enter') doTap()
      else if (e.key === 'Backspace') setTimes(undoTap)
      else if (e.key === 'Escape') onClose()
      else return
      e.preventDefault()
      document.activeElement?.blur?.()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [doTap, onClose, paused])
  useEffect(() => {
    const box = list.current
    const el = box?.querySelector('.tap-next') || box?.querySelector('.tap-line:last-child')
    if (box && el)
      box.scrollTo({
        top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2,
        behavior: 'smooth'
      })
  }, [next?.li])
  const startOver = () => {
    setTimes([])
    api.control('seek', 0)
    if (!playback?.isPlaying) api.control('play')
  }
  const save = async () => {
    setSaving(true)
    const ok = await api.saveTimedLyrics(timed, trackId)
    setSaving(false)
    if (ok) onClose()
    else setError("Couldn't save the timing")
  }
  let k = -1
  return (
    <div className="pl-lyrics tap">
      <div className="tap-head">
        <div className="tap-title">
          {times.length >= targets.length ? 'Every word timed' : 'Tap as each word starts'}
        </div>
        <div className="tap-sub">
          {error ||
            `Space, Enter or a click · Backspace undoes · ${times.length} of ${targets.length} words`}
        </div>
        <div className="tap-actions">
          <button className="pill" disabled={!canSeek} onClick={startOver}>
            Start over
          </button>
          <button className="pill" disabled={!times.length} onClick={() => setTimes(undoTap)}>
            Undo
          </button>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button
            className="pill on"
            disabled={!fullLines || saving}
            onClick={save}
            data-tip="Lines not finished keep their line timing"
          >
            {times.length >= targets.length
              ? 'Save'
              : `Save ${fullLines} ${fullLines === 1 ? 'line' : 'lines'}`}
          </button>
        </div>
      </div>
      <div className="tap-list" ref={list} onClick={doTap}>
        <div className="pl-pad" />
        {lines.map((l, li) => {
          const ws = String(l.text || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
          if (!ws.length)
            return (
              <div key={li} className="pl-gap">
                ♪
              </div>
            )
          const here = next?.li === li
          return (
            <div key={li} className={`tap-line ${here ? 'tap-next' : ''}`}>
              {ws.map((w, wi) => {
                k++
                const state = k < times.length ? 'done' : k === times.length ? 'next' : ''
                return (
                  <span key={wi} className={`tap-w ${state}`}>
                    {w}{' '}
                  </span>
                )
              })}
            </div>
          )
        })}
        <div className="pl-pad" />
      </div>
    </div>
  )
}

/**
 * Share a line: an image for stories (or a square post) with the cover, one line you pick
 * and the song's name. Copy it, or save it as a PNG.
 */
function ShareCard({ lines, current, track, onClose }) {
  const sung = useMemo(() => lines.filter((l) => String(l.text || '').trim()), [lines])
  const start = Math.max(
    0,
    sung.findIndex((l) => l === lines[current])
  )
  const [pick, setPick] = useState(start)
  const [size, setSize] = useState('story')
  const [cover, setCover] = useState(null)
  const [note, setNote] = useState('')
  const [rec, setRec] = useState(null) // seconds left while a clip records
  const [redraw, setRedraw] = useState(0)
  const canvas = useRef(null)
  const open = useRef(true) // closed while a clip records: don't ask where to save it
  useEffect(
    () => () => {
      open.current = false
    },
    []
  )
  useEffect(() => {
    let live = true
    const url = track?.cover
    if (!url) return
    api.cardCover(url).then((data) => {
      if (!live || !data) return
      const img = new Image()
      img.onload = () => live && setCover(img)
      img.src = data
    })
    return () => {
      live = false
    }
  }, [track?.cover])
  useEffect(() => {
    if (canvas.current)
      drawCard(canvas.current, {
        size,
        cover,
        line: sung[pick]?.text || '',
        title: track?.name || '',
        artist: (track?.artists || '').split(',')[0]
      })
  }, [size, cover, pick, sung, track, redraw])
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const png = () => canvas.current.toDataURL('image/png')
  const name = `${(track?.artists || '').split(',')[0]} - ${track?.name || 'Glowtide'}`
  // An animated clip of the card: drawn frame by frame onto the same canvas while a
  // MediaRecorder records it, then saved as MP4 (or WebM where MP4 isn't offered).
  const makeClip = async () => {
    setNote('')
    const r = await recordClip(
      canvas.current,
      {
        size,
        cover,
        line: sung[pick]?.text || '',
        title: track?.name || '',
        artist: (track?.artists || '').split(',')[0]
      },
      { onSecond: setRec, open: () => open.current }
    )
    if (!r) return
    setRec(null)
    setRedraw((n) => n + 1) // the still card again
    if (r.error) return setNote(r.error)
    setNote((await api.saveClip(r.bytes, name, r.ext)) ? 'Clip saved' : '')
  }
  return (
    <div className="pl-lyrics card-maker">
      <div className="tap-head">
        <div className="tap-title">Share a line</div>
        <div className="tap-actions">
          <Seg
            value={size}
            options={Object.keys(CARD_SIZES).map((k) => [k, CARD_SIZES[k].label])}
            onChange={setSize}
          />
          <button
            className="pill on"
            onClick={async () => setNote((await api.copyCard(png())) ? 'Copied' : "Couldn't copy")}
          >
            Copy image
          </button>
          <button
            className="pill"
            disabled={rec !== null}
            onClick={async () => setNote((await api.saveCard(png(), name)) ? 'Saved' : '')}
          >
            Save…
          </button>
          <button className="pill" disabled={rec !== null} onClick={makeClip}>
            {rec !== null ? `Recording… ${rec} s` : 'Make a clip…'}
          </button>
          <button className="pill" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="tap-sub">
          {note || (rec !== null ? 'Making an 8-second clip' : 'Pick a line below')}
        </div>
      </div>
      <div className="card-body">
        <canvas ref={canvas} className={`card-preview ${size}`} />
        <div className="card-lines">
          {sung.map((l, i) => (
            <button
              key={i}
              className={`card-line ${i === pick ? 'on' : ''}`}
              disabled={rec !== null}
              onClick={() => {
                setPick(i)
                setNote('')
              }}
            >
              {l.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Wrong lyrics? The versions LRCLIB has for the song (or for what you search), timed ones
 * first and closest in length. A pick is remembered for the song; Automatic forgets it.
 */
function VersionPicker({ track, chosen, onClose }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const search = useCallback(async (text) => {
    setList(undefined)
    setList(await api.lyricsCandidates(text))
  }, [])
  useEffect(() => {
    let live = true
    api.lyricsCandidates('').then((r) => live && setList(r))
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const pick = async (id) => {
    setBusy(true)
    await api.chooseLyrics(id)
    setBusy(false)
    onClose()
  }
  const songS = Math.round((track?.durationMs || 0) / 1000)
  return (
    <div className="pl-lyrics picker">
      <div className="tap-head">
        <div className="tap-title">Pick the right lyrics</div>
        <div className="tap-sub">
          Versions on LRCLIB · timed ones first, then the closest in length
        </div>
        <div className="pick-search">
          <input
            className="field"
            autoFocus
            placeholder={`Search, e.g. ${track?.name || 'a title'} ${track?.artist || ''}`.trim()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search(q)}
          />
          <button className="pill" onClick={() => search(q)}>
            Search
          </button>
        </div>
        <div className="tap-actions">
          {chosen && (
            <button className="pill" disabled={busy} onClick={() => pick(null)}>
              Automatic
            </button>
          )}
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
      <div className="pick-list">
        {list === undefined && <div className="muted pad">Looking on LRCLIB…</div>}
        {list?.error && <div className="error">{list.error}</div>}
        {Array.isArray(list) && !list.length && (
          <div className="muted pad">Nothing on LRCLIB for that. Try other words.</div>
        )}
        {Array.isArray(list) &&
          list.map((c) => (
            <button
              key={c.id}
              className={`pick-row ${c.id === chosen ? 'on' : ''}`}
              disabled={busy}
              onClick={() => pick(c.id)}
            >
              <span className="pick-t">
                <span className="pick-title">{c.title}</span>
                <span className="pick-sub">{[c.artist, c.album].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="pick-meta">
                <span className={`pick-kind ${c.synced ? 'synced' : ''}`}>
                  {c.instrumental ? 'Instrumental' : c.synced ? 'Timed' : 'Text only'}
                </span>
                <span
                  className={`pick-len ${songS && Math.abs(c.durationS - songS) <= 3 ? 'match' : ''}`}
                >
                  {fmtTime(c.durationS * 1000)}
                </span>
              </span>
            </button>
          ))}
      </div>
    </div>
  )
}

/**
 * Tap-to-sync: play the song and tap (Space, Enter or a click on the lyrics) as each line
 * starts. Backspace takes the last tap back, Esc leaves. Once every line has its time, Save
 * keeps it on this PC for the song, and the desktop overlay can show it.
 */
function TapSync({ lines, playback, trackId, canSeek, paused, onClose }) {
  const targets = useMemo(() => tapTargets(lines), [lines])
  const [times, setTimes] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const list = useRef(null)
  const done = times.length >= targets.length
  const doTap = useCallback(
    () => setTimes((t) => tap(t, positionNow(playback, 0), targets.length)),
    [playback, targets.length]
  )
  useEffect(() => {
    const key = (e) => {
      // a page over the lyrics, or typing somewhere: the keys are not taps
      const t = e.target
      if (
        e.repeat ||
        paused ||
        t?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName)
      )
        return
      if (e.key === ' ' || e.key === 'Enter') doTap()
      else if (e.key === 'Backspace') setTimes(undoTap)
      else if (e.key === 'Escape') onClose()
      else return
      e.preventDefault()
      document.activeElement?.blur?.() // so Space never also presses a focused button
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [doTap, onClose, paused])
  // the next line to tap stays in the middle
  useEffect(() => {
    const box = list.current
    const el = box?.querySelector('.tap-next') || box?.querySelector('.tap-line:last-child')
    if (box && el)
      box.scrollTo({
        top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2,
        behavior: 'smooth'
      })
  }, [times.length])
  const startOver = () => {
    setTimes([])
    api.control('seek', 0)
    if (!playback?.isPlaying) api.control('play')
  }
  const save = async () => {
    setSaving(true)
    const ok = await api.saveTimedLyrics(timedLines(lines, times), trackId)
    setSaving(false)
    if (ok) onClose()
    else setError("Couldn't save the timing")
  }
  let k = -1
  return (
    <div className="pl-lyrics tap">
      <div className="tap-head">
        <div className="tap-title">{done ? 'Every line timed' : 'Tap as each line starts'}</div>
        <div className="tap-sub">
          {error ||
            `Space, Enter or a click · Backspace undoes · ${times.length} of ${targets.length}`}
        </div>
        <div className="tap-actions">
          <button
            className="pill"
            disabled={!canSeek}
            onClick={startOver}
            data-tip="Back to the start of the song, taps cleared"
          >
            Start over
          </button>
          <button className="pill" disabled={!times.length} onClick={() => setTimes(undoTap)}>
            Undo
          </button>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button className="pill on" disabled={!done || saving} onClick={save}>
            Save
          </button>
        </div>
      </div>
      <div className="tap-list" ref={list} onClick={doTap}>
        <div className="pl-pad" />
        {lines.map((l, i) => {
          if (!String(l.text || '').trim())
            return (
              <div key={i} className="pl-gap">
                ♪
              </div>
            )
          k++
          const state = k < times.length ? 'done' : k === times.length ? 'tap-next' : ''
          return (
            <div key={i} className={`tap-line ${state}`}>
              <span className="tap-t">{k < times.length ? fmtTime(times[k]) : ''}</span>
              {l.text}
            </div>
          )
        })}
        <div className="pl-pad" />
      </div>
    </div>
  )
}

/**
 * Lyrics with no timing: the whole text, scrolled gently through as the song goes (by how
 * far into the song it is, as a guess, not a claim of timing). Scrolling it yourself holds
 * it where you put it for a few seconds.
 */
function PlainLyrics({ lines, playback, durationMs }) {
  const pos = usePosition(playback, durationMs, 1000)
  const box = useRef(null)
  const heldUntil = useRef(0)
  useEffect(() => {
    const el = box.current
    if (!el || !durationMs || Date.now() < heldUntil.current) return
    const f = Math.min(1, Math.max(0, pos / durationMs))
    el.scrollTo({ top: f * (el.scrollHeight - el.clientHeight), behavior: 'smooth' })
  }, [pos, durationMs])
  const hold = () => (heldUntil.current = Date.now() + 6000)
  return (
    <div className="pl-lyrics plain" ref={box} onWheel={hold} onTouchMove={hold}>
      <div className="pl-pad" />
      <div className="pl-untimed">Not timed · scrolls along with the song</div>
      {lines.map((l, i) =>
        l.text ? (
          <div key={i} className="pl-line">
            {l.text}
          </div>
        ) : (
          <div key={i} className="pl-gap">
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

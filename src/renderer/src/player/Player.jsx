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
  Palette,
  AudioWaveform,
  Lightbulb,
  Monitor,
  PanelBottom,
  History,
  MonitorUp,
  Check
} from 'lucide-react'
import { api, fmtTime, useColours, useDisplays, useGlowtide, usePosition } from '../lib/store'
import { lineIndexAt } from '../../../shared/lyrics.mjs'
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
      className={`player ${fade} ${state.playerMaximized ? 'max' : ''}`}
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
        <NowPlaying state={state} settings={settings} lyrics={lyrics} setPanel={setPanel} />
      )}
      {/* Panels belong to the player screen: never let one cover Welcome or Connect Spotify. */}
      {panel && screen === 'player' && (
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

function NowPlaying({ state, settings, lyrics, setPanel }) {
  const { track, playback } = state
  const pos = usePosition(playback, track?.durationMs, 250)
  const [drag, setDrag] = useState(null)
  const [artBig, setArtBig] = useState(false)
  const [lyricsView, toggleLyricsView] = useLyricsView()
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

  return (
    <div className={`np ${artBig && !open ? 'art-big' : ''} ${open ? 'lyrics-open' : ''}`}>
      {track?.cover && <img className="backdrop" src={track.cover} alt="" />}
      <div className="art-tint" />
      <div className="np-main">
        <div className="np-card">
          <div className="np-left">
            {yt ? (
              <YouTubeStage state={state} onOpenLibrary={() => setPanel('library')} />
            ) : track?.cover ? (
              <img
                className="cover"
                src={track.cover}
                alt={`${track.album || track.name} cover`}
                onMouseEnter={() => setArtBig(true)}
                onMouseLeave={() => setArtBig(false)}
              />
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
                data-tip={playback?.shuffle ? 'Shuffle on' : 'Shuffle'}
                disabled={!can('shuffle')}
                onClick={() => api.control('shuffle', !playback?.shuffle)}
              >
                <Shuffle size={15} />
              </button>
              <button
                className="rd"
                aria-label="Back 15 seconds"
                data-tip="Back 15"
                disabled={!canSkip}
                onClick={() => skip(-SKIP_MS)}
              >
                <Skip15 back />
              </button>
              <button
                className="rd"
                aria-label="Previous"
                data-tip="Previous"
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
                data-tip="Skip"
                disabled={!can('next')}
                onClick={() => api.control('next')}
              >
                <SkipForward size={16} />
              </button>
              <button
                className="rd"
                aria-label="Forward 15 seconds"
                data-tip="Forward 15"
                disabled={!canSkip}
                onClick={() => skip(SKIP_MS)}
              >
                <Skip15 />
              </button>
              <button
                className={`rd ${playback?.repeat && playback.repeat !== 'off' ? 'on' : ''}`}
                aria-label="Repeat"
                data-tip={
                  { off: 'Repeat', context: 'Repeat all', track: 'Repeat one' }[
                    playback?.repeat || 'off'
                  ]
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
              {!yt && (
                <button
                  className={`pill ${open ? 'on' : ''}`}
                  aria-pressed={open}
                  data-tip={open ? 'Hide lyrics' : 'Show lyrics here'}
                  onClick={toggleLyricsView}
                >
                  <MicVocal size={13} /> Lyrics
                </button>
              )}
              <button
                className={`rd ${settings.lyrics.overlay ? 'on' : ''}`}
                aria-label="Lyrics on the desktop"
                aria-pressed={settings.lyrics.overlay}
                data-tip={settings.lyrics.overlay ? 'Desktop lyrics on' : 'Desktop lyrics off'}
                onClick={() => api.setSettings({ lyrics: { overlay: !settings.lyrics.overlay } })}
              >
                <MonitorUp size={15} />
              </button>
              {synced && (
                <div
                  className={`sync-xp ${state.lyricsOffsetMs ? 'moved' : ''}`}
                  title="Lyrics early or late? Nudge them; Glowtide remembers it for this song. Double-click to reset."
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
        <button
          className={`rd ${state.liked ? 'on' : ''}`}
          aria-label={state.liked ? 'Remove from liked songs' : 'Save to liked songs'}
          data-tip={state.liked ? 'Liked' : 'Like'}
          disabled={state.source !== 'spotify' || state.liked == null}
          onClick={() => api.control('like', !state.liked)}
        >
          <Heart size={15} fill={state.liked ? 'currentColor' : 'none'} />
        </button>
        <button
          className="rd"
          aria-label="Queue"
          data-tip="Queue"
          onClick={() => setPanel('queue')}
        >
          <ListMusic size={15} />
        </button>
        <button
          className="rd"
          aria-label="Search"
          data-tip="Search"
          onClick={() => setPanel('search')}
        >
          <Search size={15} />
        </button>
        <GlowQuick settings={settings} />
        <button className="pill" onClick={() => setPanel('settings')}>
          <Cog size={13} /> Settings
        </button>
        <DisplayQuick settings={settings} />
        <button
          className="rd"
          aria-label="Devices"
          data-tip={sys ? 'Follow which app' : 'Devices'}
          disabled={noDevices}
          onClick={() => setPanel(sys ? 'apps' : 'devices')}
        >
          <MonitorSpeaker size={15} />
        </button>
        <button
          className="rd"
          aria-label="Library"
          data-tip="Library"
          onClick={() => setPanel('library')}
        >
          <Library size={15} />
        </button>
      </div>
    </div>
  )
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
 * A dock button that opens a small panel above the dock while the pointer is over it (or it
 * has keyboard focus), the way the Mac player's toolbar opens into its choices.
 */
function Quick({ icon, label, on, onClick, children, wide }) {
  return (
    <div className={`qx ${wide ? 'wide' : ''}`}>
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

/** Gradient, animation and glow brightness, each a click away in the dock. */
function GlowQuick({ settings }) {
  const g = settings.glow
  const set = (patch) => api.setSettings({ glow: patch })
  const anim = glowAnimation(g)
  return (
    <>
      <Quick icon={<Palette size={15} />} label="Gradient">
        <QSeg
          value={g.gradient === 2 ? 2 : 1}
          options={GRADIENTS}
          onChange={(v) => set({ gradient: v })}
        />
      </Quick>
      <Quick icon={<AudioWaveform size={15} />} label="Animation" wide>
        <QSeg value={anim} options={ANIMATION_OPTIONS} onChange={(v) => set({ animation: v })} />
      </Quick>
      <Quick
        icon={<Lightbulb size={15} />}
        label={g.enabled ? 'Edge glow' : 'Edge glow (off)'}
        on={g.enabled}
        onClick={() => set({ enabled: !g.enabled })}
      >
        <div className="qslide">
          <button
            className="rd sm ghost"
            aria-label="Dimmer"
            onClick={() => set({ intensity: Math.max(10, g.intensity - 10) })}
          >
            −
          </button>
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
          <button
            className="rd sm ghost"
            aria-label="Brighter"
            onClick={() => set({ intensity: Math.min(100, g.intensity + 10), enabled: true })}
          >
            +
          </button>
        </div>
        <span className="qx-note">Click the bulb to turn the glow {g.enabled ? 'off' : 'on'}.</span>
      </Quick>
    </>
  )
}

/** Which display glows, and whether the glow keeps clear of the taskbar. */
function DisplayQuick({ settings }) {
  const displays = useDisplays()
  const g = settings.glow
  const set = (patch) => api.setSettings({ glow: patch })
  const choices = [
    ['all', 'All displays'],
    ['primary', 'Main display'],
    ...(displays.length > 1 ? displays.map((d) => [d.id, d.label]) : [])
  ]
  return (
    <>
      <Quick icon={<Monitor size={15} />} label="Display" wide>
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
      <Quick icon={<PanelBottom size={15} />} label="Taskbar" on={!!g.taskbar}>
        <QSeg
          value={g.taskbar ? 'on' : 'off'}
          options={[
            ['off', 'Behind'],
            ['on', 'Clear of it']
          ]}
          onChange={(v) => set({ taskbar: v === 'on' })}
        />
        <span className="qx-note">Where the glow runs along the taskbar.</span>
      </Quick>
    </>
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

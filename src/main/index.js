import {
  app,
  BrowserWindow,
  globalShortcut,
  powerSaveBlocker,
  Menu,
  Tray,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell
} from 'electron'
import { join } from 'path'
import os from 'os'
import { writeFileSync, mkdirSync, rmSync, appendFileSync, statSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, updateSettings } from './settings'
import { REDIRECT_URI } from './oauth'
import { createSpotify, createSpotifyAuth, slimTrack } from './spotify'
import { createGoogleAuth, createYouTube } from './youtube'
import { startYtHost, YT_HOST_ORIGIN } from './ytHost'
import { fetchLyrics } from './lyricsSource'
import { loadAmllIndex } from './amll'
import { offsetFor, saveOffset } from './offsets'
import { createWidgets } from './widgets'
import { createDemo } from './demo'
import { extractPalette } from '../shared/colour.mjs'
import { glowBounds, pickDisplays } from '../shared/glow.mjs'
import { parseYouTubeTitle, YT_ERRORS } from '../shared/youtube.mjs'
import { appLabel, systemTrack, repeatFromSmtc } from '../shared/media.mjs'
import { createSmtc } from './smtc'
import { createFullscreenWatch } from './fullscreen'
import { createUpdater } from './updater'
import { hardenContents, hardenSession, isSafeExternal, trustedSender } from './security'

// The GLOWTIDE_* test hooks (snapshots, probes, separate profiles) only work in a development
// run. A packaged copy ignores them all, so nothing in the environment can steer it.
const DEV = !app.isPackaged

// A main-process error is written to glowtide.log in the settings folder rather than shown as
// Electron's raw "A JavaScript error occurred" dialog. The log is kept under 1 MB.
function logError(kind, e) {
  try {
    const file = join(app.getPath('userData'), 'glowtide.log')
    try {
      if (statSync(file).size > 1_000_000) writeFileSync(file, '')
    } catch {
      /* no log yet */
    }
    appendFileSync(
      file,
      `${new Date().toISOString()} ${kind} ${e?.stack || e}
`
    )
  } catch {
    /* nowhere to write: nothing more to do */
  }
}
process.on('uncaughtException', (e) => logError('uncaught', e))
process.on('unhandledRejection', (e) => logError('unhandled', e))

const spotifyAuth = createSpotifyAuth(() => loadSettings().clientId)
const spotify = createSpotify(spotifyAuth)
const googleAuth = createGoogleAuth(() => ({
  clientId: loadSettings().googleClientId,
  clientSecret: loadSettings().googleClientSecret
}))
const yt = createYouTube(googleAuth)
const demo = createDemo()
const smtc = createSmtc((m) => onSystemMessage(m))
const updater = createUpdater({
  automatic: () => !!loadSettings().autoUpdate,
  // GLOWTIDE_UPDATE_FEED=<url>: a development run updates from this feed instead of not at all
  devFeed: (DEV && process.env.GLOWTIDE_UPDATE_FEED) || null,
  onError: (e) => logError('update', e),
  onChange: (u) => {
    const readyChanged = (state.update?.status === 'ready') !== (u.status === 'ready')
    state.update = u
    broadcast()
    if (readyChanged) rebuildTray()
    // GLOWTIDE_UPDATE_INSTALL=1: install as soon as the update has downloaded
    if (DEV && process.env.GLOWTIDE_UPDATE_INSTALL && u.status === 'ready')
      setTimeout(installUpdate, 1500)
  }
})

let player = null
let lyricsWin = null
let glowWins = []
let quickWin = null // the tray's quick settings panel
let tray = null
let widgets = null
let quitting = false

// ---------- state ----------
const state = {
  source: null, // 'system' | 'spotify' | 'youtube' | 'demo' | null
  demo: false, // derived: source === 'demo'
  systemApps: [], // [{ id, label }] apps with a Windows media session
  systemApp: null, // { id, label } the one being followed
  systemSelected: 'auto',
  caps: null, // what the followed app lets us do: { play, pause, next, previous, seek, shuffle, repeat }
  connected: false, // Spotify
  spotifyPlan: null, // 'premium' | 'free' | null (unknown)
  google: false,
  ytReady: false,
  ytHostOrigin: YT_HOST_ORIGIN,
  ytQueue: null,
  track: null,
  palette: null,
  playback: null,
  liked: null,
  lyricsStatus: 'none',
  lyricsTiming: null, // 'word' (measured) | 'line' (words estimated)
  lyricsSource: null,
  lyricsOffsetMs: 0,
  error: null,
  redirectUri: REDIRECT_URI,
  // True while Glowtide's own window is the one in use: the lyrics overlay steps aside so it
  // never covers Glowtide's settings or controls.
  playerFocused: false,
  playerMaximized: false,
  // Another app fills a display (a game, a full-screen video): the overlays there step aside.
  fullscreenApp: false,
  // Glowtide's own full-screen view is open on the lyrics overlay's display: the overlay keeps
  // its corner text clear of the view's song title.
  lyricsOverStage: false,
  update: null // see updater.js
}
let lyricsLines = []
const ytMeta = new Map() // videoId -> metadata from our own API calls (cleaner than player titles)
let ytShuffle = false
let ytRepeat = 'off'
let ytErrorVideo = null

function all() {
  // The tray panel only while it's open: hidden, it would redraw for nothing every second.
  const quick = quickWin && !quickWin.isDestroyed() && quickWin.isVisible() ? quickWin : null
  return [player, lyricsWin, quick, ...glowWins, ...(widgets ? widgets.windows() : [])].filter(
    (w) => w && !w.isDestroyed()
  )
}
function broadcast() {
  const stageOn = widgets?.stageDisplay() ?? null
  state.lyricsOverStage = stageOn !== null && !!lyricsWin && lyricsDisplayId === stageOn
  for (const w of all()) w.webContents.send('state', state)
  syncAwake()
}

// Keep the display on while music plays, if asked.
let awakeId = null
function syncAwake() {
  const want = !!loadSettings().awake && !!state.playback?.isPlaying
  if (want && awakeId === null) awakeId = powerSaveBlocker.start('prevent-display-sleep')
  if (!want && awakeId !== null) {
    powerSaveBlocker.stop(awakeId)
    awakeId = null
  }
}

/** The display the lyrics overlay lives on: the chosen one if still connected, else the main one. */
function lyricsDisplay() {
  const want = loadSettings().lyrics.display
  return (
    (want !== 'primary' && screen.getAllDisplays().find((d) => d.id === want)) ||
    screen.getPrimaryDisplay()
  )
}
let lyricsDisplayId = null
function sendLyrics() {
  for (const w of all()) w.webContents.send('lyrics', lyricsLines)
}
function sendSettings() {
  for (const w of all()) w.webContents.send('settings', loadSettings())
}
function ytCommand(action, arg) {
  if (player && !player.isDestroyed()) player.webContents.send('yt:command', { action, arg })
}

async function paletteFor(url) {
  try {
    if (!/^(https:|data:image\/)/i.test(url || '')) return null
    const buf = url.startsWith('data:')
      ? Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
      : Buffer.from(await (await fetch(url)).arrayBuffer())
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return null
    const small = img.resize({ width: 64, height: 64, quality: 'good' })
    return extractPalette(small.toBitmap(), { order: 'bgra' })
  } catch {
    return null
  }
}

function clearTrack() {
  state.track = null
  state.palette = null
  state.playback = null
  state.liked = null
  state.lyricsStatus = 'none'
  state.lyricsTiming = null
  state.lyricsSource = null
  state.ytQueue = null
  lyricsLines = []
  sendLyrics()
}

async function onTrackChange(track) {
  state.palette = null
  state.liked = null
  // The nudge is per song, and remembered: a mistimed lyric file only needs fixing once.
  state.lyricsOffsetMs = offsetFor(track)
  state.lyricsStatus = 'loading'
  state.lyricsTiming = null
  state.lyricsSource = null
  lyricsLines = []
  sendLyrics()
  const id = track.id
  if (track.cover)
    paletteFor(track.cover).then((p) => {
      if (state.track?.id === id) {
        state.palette = p
        broadcast()
      }
    })
  // Music videos often run longer than the song (intros, outros): match more loosely.
  const video = state.source === 'youtube' || (state.source === 'system' && !track.album)
  // Only the Spotify source knows Spotify's track id; the others match by title and artist.
  const spotifyId = state.source === 'spotify' ? track.id : undefined
  fetchLyrics(track, { toleranceS: video ? 20 : 4, spotifyId }).then((l) => {
    if (state.track?.id !== id) return
    state.lyricsStatus = l.status
    state.lyricsTiming = l.timing || null
    state.lyricsSource = l.source || null
    lyricsLines = l.lines
    sendLyrics()
    broadcast()
  })
  if (state.source === 'spotify') {
    spotify
      .isLiked(id)
      .then((r) => {
        if (state.track?.id === id) {
          state.liked = !!r?.[0]
          broadcast()
        }
      })
      .catch(() => {})
  }
}

async function refreshSpotifyPlan() {
  try {
    const me = await spotify.me()
    state.spotifyPlan = me?.product === 'premium' ? 'premium' : me?.product ? 'free' : null
  } catch {
    state.spotifyPlan = null
  }
}

let pollTimer = null
async function poll() {
  clearTimeout(pollTimer)
  let delay = 2500
  try {
    if (state.source === 'demo') {
      const s = demo.snapshot()
      if (s.track.id !== state.track?.id) {
        state.track = s.track
        state.palette = s.palette
        state.lyricsOffsetMs = offsetFor(s.track)
        state.lyricsStatus = s.lyrics.status
        state.lyricsTiming = 'line'
        state.lyricsSource = 'Demo'
        lyricsLines = s.lyrics.lines
        sendLyrics()
      }
      state.playback = s.playback
      state.liked = null
      state.error = null
      delay = 1000
    } else if (state.source === 'spotify' && spotifyAuth.isConnected() && loadSettings().clientId) {
      if (state.spotifyPlan === null) await refreshSpotifyPlan()
      const p = await spotify.player()
      const track = slimTrack(p?.item)
      state.playback = p
        ? {
            isPlaying: !!p.is_playing,
            progressMs: p.progress_ms ?? 0,
            at: Date.now(),
            shuffle: !!p.shuffle_state,
            repeat: p.repeat_state || 'off',
            volume: p.device?.volume_percent ?? null,
            device: p.device ? { id: p.device.id, name: p.device.name, type: p.device.type } : null
          }
        : null
      if (track?.id !== state.track?.id) {
        state.track = track
        if (track) onTrackChange(track)
        else {
          lyricsLines = []
          state.lyricsStatus = 'none'
          sendLyrics()
        }
      }
      // Errors clear once their cause is gone: "no active device" as soon as Spotify reports
      // one (it was opened or picked), anything else except Premium on the next good poll.
      if (state.error) {
        const deviceErr = /device/i.test(state.error)
        if (deviceErr ? !!p?.device : !/Premium/i.test(state.error)) state.error = null
        // Spotify only reports an *active* device once something plays; opening the app
        // is enough to make it a device, so clear the message as soon as one shows up.
        if (state.error && deviceErr && !p) {
          const d = await spotify.devices().catch(() => null)
          if (d?.devices?.length) state.error = null
        }
      }
      delay = p?.is_playing ? 1000 : 2500
    }
    // YouTube: no polling, the embedded player pushes its state (onYtMessage).
  } catch (e) {
    state.error = e.message
    delay = 4000
  }
  state.connected = spotifyAuth.isConnected()
  state.google = googleAuth.isConnected()
  broadcast()
  pollTimer = setTimeout(poll, delay)
}

function onYtMessage(m) {
  if (process.env.GLOWTIDE_DEBUG)
    console.log('[yt]', m?.type, m?.state ?? '', m?.code ?? '', m?.videoId ?? '', m?.title ?? '')
  if (state.source !== 'youtube' || !m) return
  if (m.type === 'ready') {
    state.ytReady = true
    return broadcast()
  }
  if (m.type === 'error') {
    state.error = YT_ERRORS[m.code] || `YouTube player error ${m.code}`
    // The host page skips ahead only inside a playlist; say so only then.
    if ((state.ytQueue?.items?.length || 0) > 1) state.error += ' Skipping to the next one.'
    ytErrorVideo = m.videoId || null
    return broadcast()
  }
  if (m.type !== 'state') return
  const playing = m.state === 1 || m.state === 3
  state.playback = m.videoId
    ? {
        isPlaying: playing,
        progressMs: Math.round((m.time || 0) * 1000),
        at: Date.now(),
        shuffle: ytShuffle,
        repeat: ytRepeat,
        volume: null,
        device: { name: 'Glowtide', type: 'Computer' }
      }
    : null
  state.ytQueue = Array.isArray(m.playlist)
    ? {
        index: m.index,
        items: m.playlist.map((id) => ({
          videoId: id,
          name: ytMeta.get(id)?.name || null,
          artists: ytMeta.get(id)?.artists || null
        }))
      }
    : null
  if (m.videoId && m.duration > 0 && `yt:${m.videoId}` !== state.track?.id) {
    // Metadata from our own API calls is cleaner; a pasted link has only an id, so parse the title.
    const meta = ytMeta.get(m.videoId)
    const parsed = meta?.name
      ? { artist: meta.artist, title: meta.name }
      : parseYouTubeTitle(m.title, m.author)
    const track = {
      id: `yt:${m.videoId}`,
      videoId: m.videoId,
      uri: `yt:${m.videoId}`,
      name: parsed.title || m.title || 'Untitled',
      artists: parsed.artist || m.author,
      artist: parsed.artist || m.author,
      album: '',
      rawTitle: m.title,
      cover: `https://i.ytimg.com/vi/${m.videoId}/mqdefault.jpg`,
      thumb: `https://i.ytimg.com/vi/${m.videoId}/default.jpg`,
      durationMs: Math.round(m.duration * 1000)
    }
    state.track = track
    // An error for this very video (it often arrives just before its metadata) must survive.
    if (ytErrorVideo !== m.videoId) state.error = null
    onTrackChange(track)
  }
  broadcast()
}

// ---------- "Any app": Windows media sessions ----------
let sysThumb = { key: null, dataUrl: null }

function onSystemMessage(m) {
  if (state.source !== 'system' || !m) return
  if (m.type === 'sessions') {
    // Glowtide's own session (its YouTube player) is not "another app" to follow.
    state.systemApps = (m.apps || [])
      .filter((id) => (DEV && process.env.GLOWTIDE_SYS_TEST) || id !== 'io.github.cynicalk.glowtide')
      .map((id) => ({ id, label: appLabel(id) }))
    return broadcast()
  }
  if (m.type === 'error') {
    state.error = m.message
    return broadcast()
  }
  if (m.type === 'thumb') {
    sysThumb = { key: m.key, dataUrl: m.dataUrl }
    if (state.track && state.track.smtcKey === m.key && !state.track.cover) {
      state.track = { ...state.track, cover: m.dataUrl, thumb: m.dataUrl }
      const id = state.track.id
      paletteFor(m.dataUrl).then((p) => {
        if (state.track?.id === id) {
          state.palette = p
          broadcast()
        }
      })
      broadcast()
    }
    return
  }
  if (m.type !== 'state') return
  if (state.error && /helper|PowerShell|media info/i.test(state.error)) state.error = null
  if (!m.app) {
    state.systemApp = null
    state.caps = null
    if (state.track) clearTrack()
    return broadcast()
  }
  state.systemApp = { id: m.app, label: appLabel(m.app) }
  state.caps = m.can || null
  const base = systemTrack(m)
  const nothing = !m.title && !m.artist
  state.playback = nothing
    ? null
    : {
        isPlaying: !!m.playing,
        progressMs: m.positionMs || 0,
        at: Date.now(),
        shuffle: !!m.shuffle,
        repeat: repeatFromSmtc(m.repeat),
        volume: null,
        device: { name: state.systemApp.label, type: 'Computer' }
      }
  if (nothing) {
    if (state.track) clearTrack()
  } else if (base.id !== state.track?.id) {
    const cover = sysThumb.key === m.key ? sysThumb.dataUrl : null
    const track = { ...base, smtcKey: m.key, cover, thumb: cover }
    state.track = track
    onTrackChange(track)
  } else if (base.durationMs && !state.track.durationMs) {
    // Some apps fill in the duration a moment after the title.
    state.track = { ...state.track, durationMs: base.durationMs }
  }
  broadcast()
}

/**
 * Run a play request; if Spotify says no device is active, send it to an open Spotify
 * (this PC's first) and try once more, so pressing Play right after opening Spotify works.
 */
async function withDevice(run) {
  try {
    return await run(undefined)
  } catch (e) {
    if (e.reason !== 'NO_ACTIVE_DEVICE' && !/no active device/i.test(e.message)) throw e
    const list = (await spotify.devices().catch(() => null))?.devices || []
    const pick = list.find((d) => d.is_active) || list.find((d) => d.type === 'Computer') || list[0]
    if (!pick) throw e
    return run(pick.id)
  }
}

async function control(action, arg) {
  if (state.source === 'system') {
    const c = state.caps || {}
    const allowed = {
      play: c.play,
      pause: c.pause,
      next: c.next,
      previous: c.previous,
      seek: c.seek,
      shuffle: c.shuffle,
      repeat: c.repeat
    }
    if (!(action in allowed))
      return { error: `Use ${state.systemApp?.label || 'the app'} for that.` }
    if (!allowed[action])
      return { error: `${state.systemApp?.label || 'This app'} doesn't allow that from outside.` }
    // one plain value at most: a seek position, on/off, or a repeat mode
    if (arg !== undefined && !/^[\w.-]{1,32}$/.test(String(arg))) return { error: 'Bad value.' }
    smtc.send(`${action}${arg !== undefined ? ` ${arg}` : ''}`)
    if (state.playback && (action === 'play' || action === 'pause')) {
      state.playback = { ...state.playback, isPlaying: action === 'play', at: Date.now() }
      broadcast()
    }
    return { ok: true }
  }
  if (state.source === 'demo') {
    demo.control(action, arg)
    return poll()
  }
  if (state.source === 'youtube') {
    if (action === 'shuffle') ytShuffle = !!arg
    if (action === 'repeat') ytRepeat = arg
    if (action === 'playItems') {
      // YouTube ids only: 11 characters for a video, a short token for a playlist
      const items = (Array.isArray(arg?.items) ? arg.items : []).filter((v) =>
        /^[\w-]{11}$/.test(v?.videoId)
      )
      const playlistId = /^[\w-]{2,64}$/.test(arg?.playlistId) ? arg.playlistId : undefined
      for (const v of items) ytMeta.set(v.videoId, v)
      ytCommand('load', {
        videoIds: items.length ? items.map((v) => v.videoId) : undefined,
        playlistId,
        index: Number.isInteger(arg?.index) ? arg.index : 0
      })
      return { ok: true }
    }
    if (['queue', 'transfer', 'like'].includes(action))
      return { error: "That isn't available for YouTube yet." }
    ytCommand(action, arg)
    if (state.playback && (action === 'play' || action === 'pause')) {
      state.playback = { ...state.playback, isPlaying: action === 'play', at: Date.now() }
    }
    if (state.playback && (action === 'shuffle' || action === 'repeat'))
      state.playback = { ...state.playback, shuffle: ytShuffle, repeat: ytRepeat }
    broadcast()
    return { ok: true }
  }
  // Spotify
  if (state.spotifyPlan === 'free' && action !== 'like') {
    return {
      error: 'Free Spotify accounts can only be followed, not controlled. Use Spotify to play.'
    }
  }
  try {
    state.error = null
    const s = spotify
    if (action === 'play') await withDevice((id) => s.play(undefined, id))
    else if (action === 'pause') await s.pause()
    else if (action === 'next') await s.next()
    else if (action === 'previous') await s.previous()
    else if (action === 'seek') await s.seek(arg)
    else if (action === 'shuffle') await s.shuffle(arg)
    else if (action === 'repeat') await s.repeat(arg)
    else if (action === 'volume') await s.volume(arg)
    else if (action === 'transfer') await s.transfer(arg)
    else if (action === 'queue') await s.addToQueue(arg)
    else if (action === 'playItems') await withDevice((id) => s.play(arg, id))
    else if (action === 'like' && state.track) {
      await s.setLiked(state.track.id, arg)
      state.liked = arg
    }
    // Spotify takes a moment to reflect a change; optimistic local update for play/pause.
    if (state.playback && (action === 'play' || action === 'pause')) {
      state.playback = { ...state.playback, isPlaying: action === 'play', at: Date.now() }
      broadcast()
    }
  } catch (e) {
    if (e.reason === 'PREMIUM_REQUIRED') state.spotifyPlan = 'free'
    state.error = e.message
    broadcast()
    return { error: e.message }
  }
  setTimeout(poll, 350)
  return { ok: true }
}

async function query(kind, arg) {
  if (kind === 'demoTracks') return demo.tracks.map(({ palette, ...t }) => t) // eslint-disable-line no-unused-vars
  try {
    if (kind.startsWith('yt')) {
      if (!googleAuth.isConnected())
        return { error: 'Sign in with Google to load your YouTube library.', needsGoogle: true }
      if (kind === 'ytPlaylists') return await yt.playlists()
      if (kind === 'ytPlaylistItems') return await yt.playlistItems(arg)
      if (kind === 'ytLiked') return await yt.likedMusic()
      if (kind === 'ytSearch') return await yt.search(arg)
      return null
    }
    if (state.source !== 'spotify') return { error: 'Connect Spotify first.' }
    const s = spotify
    if (kind === 'search') return await s.search(arg)
    if (kind === 'liked') return await s.likedTracks(arg || 0)
    if (kind === 'playlists') return await s.playlists(arg || 0)
    if (kind === 'playlistTracks') return await s.playlistTracks(arg)
    if (kind === 'albumTracks') return await s.albumTracks(arg)
    if (kind === 'queue') return await s.queue()
    if (kind === 'devices') return await s.devices()
    if (kind === 'recent') return await s.recent()
    if (kind === 'me') return await s.me()
  } catch (e) {
    return { error: e.message }
  }
  return null
}

function setSource(src) {
  if (state.source === 'youtube' && src !== 'youtube') ytCommand('pause')
  if (src === 'system') smtc.start()
  else smtc.stop()
  if (src !== 'system') {
    state.systemApp = null
    state.systemApps = []
    state.caps = null
  }
  state.source = src
  state.demo = src === 'demo'
  state.error = null
  if (src !== 'demo') updateSettings({ source: src })
  clearTrack()
  rebuildTray()
  broadcast()
  poll()
}

// ---------- windows ----------
function load(win, route) {
  // If a window's page crashes, log it and bring the page back rather than leaving a blank
  // window or a hole where the overlay was.
  if (!win.glowtideGuarded) {
    win.glowtideGuarded = true
    win.webContents.on('render-process-gone', (_e, d) => {
      logError(`renderer ${route}`, d.reason)
      if (d.reason !== 'clean-exit' && !win.isDestroyed()) setTimeout(() => load(win, route), 1000)
    })
  }
  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/${route}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
}

// Every Glowtide window. The safe values are Electron's defaults, but they are written out so a
// change of default can never quietly turn one off: no Node.js in pages, pages isolated
// from the preload, sandboxed, web security on, and no middle-click opening windows.
const prefs = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  disableBlinkFeatures: 'Auxclick',
  devTools: DEV,
  backgroundThrottling: false
}

function createPlayer() {
  player = new BrowserWindow({
    width: 460,
    height: 700,
    minWidth: 420,
    minHeight: 580,
    show: false,
    frame: false,
    backgroundColor: '#070608',
    title: 'Glowtide',
    icon,
    webPreferences: { ...prefs, autoplayPolicy: 'no-user-gesture-required' }
  })
  player.setSkipTaskbar(!loadSettings().showInTaskbar)
  player.on('ready-to-show', () => player.show())
  // Without a taskbar button, a minimised player would have nowhere to come back from:
  // it goes to the tray instead.
  player.on('minimize', () => {
    if (!loadSettings().showInTaskbar) player.hide()
  })
  player.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      player.hide()
    }
  })
  // YouTube's terms don't allow playing with the player hidden, so YouTube pauses with the window.
  const pauseYt = () => state.source === 'youtube' && control('pause')
  player.on('hide', pauseYt)
  player.on('minimize', pauseYt)
  const setFocused = (on) => {
    if (state.playerFocused === on) return
    state.playerFocused = on
    broadcast()
  }
  player.on('focus', () => setFocused(true))
  const setMax = () => {
    state.playerMaximized = player.isMaximized() || player.isFullScreen()
    broadcast()
  }
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'])
    player.on(ev, setMax)
  // F11: full screen, as in a browser.
  player.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      player.setFullScreen(!player.isFullScreen())
      e.preventDefault()
    }
  })
  for (const ev of ['blur', 'hide', 'minimize']) player.on(ev, () => setFocused(false))
  player.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  load(player, 'player')
}

function overlayWindow(bounds, route, { exact = false } = {}) {
  const w = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: prefs
  })
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setIgnoreMouseEvents(true)
  // Windows trims a new window to the work area. exact: put it back over the taskbar too.
  const fit = () => exact && !w.isDestroyed() && w.setBounds(bounds)
  fit()
  w.on('show', fit)
  w.on('ready-to-show', () => {
    w.glowtideReady = true
    if (!coveredByFullscreen(w)) w.showInactive()
  })
  load(w, route)
  return w
}

// ---------- full-screen apps ----------
// While another app fills a display, the edge glow and the lyrics overlay
// on that display hide. A hidden window stops drawing, so a game gets the graphics card back.
// Displays with nothing full screen keep theirs.
let fullscreenRect = null // the display being filled, in physical pixels
const fullscreen = createFullscreenWatch((rect) => {
  fullscreenRect = rect
  applyFullscreen()
})

/** The id of the display another app fills, or null. */
function filledDisplay() {
  if (!fullscreenRect || !loadSettings().hideForFullscreen) return null
  return screen.getDisplayMatching(screen.screenToDipRect(null, fullscreenRect)).id
}

function coveredByFullscreen(w) {
  const id = filledDisplay()
  return id !== null && screen.getDisplayMatching(w.getBounds()).id === id
}

function applyFullscreen() {
  if (quitting) return
  for (const w of [...glowWins, lyricsWin]) {
    if (!w || w.isDestroyed() || !w.glowtideReady) continue
    const hide = coveredByFullscreen(w)
    // Glowtide's pages never throttle (an overlay counts as covered and would stall),
    // so a hidden overlay would keep drawing. Throttled while hidden, it stops.
    if (hide && w.isVisible()) {
      w.webContents.setBackgroundThrottling(true)
      w.hide()
    } else if (!hide && !w.isVisible()) {
      w.webContents.setBackgroundThrottling(false)
      w.showInactive()
    }
  }
  const id = filledDisplay()
  if (state.fullscreenApp !== (id !== null)) {
    state.fullscreenApp = id !== null
    broadcast()
  }
}

/** The watcher runs only while there's an overlay or widget it could hide. */
function syncFullscreenWatch() {
  const s = loadSettings()
  const want = s.hideForFullscreen && (s.glow.enabled || s.lyrics.overlay)
  if (want) fullscreen.start()
  else fullscreen.stop()
  applyFullscreen()
}

function syncOverlays() {
  const s = loadSettings()
  for (const w of glowWins) if (!w.isDestroyed()) w.destroy()
  glowWins = []
  if (s.glow.enabled) {
    const displays = pickDisplays(
      s.glow.displays,
      screen.getAllDisplays(),
      screen.getPrimaryDisplay().id
    )
    glowWins = displays.map((d, i) =>
      overlayWindow(glowBounds(d, s.glow.taskbar), `glow?d=${i}`, { exact: true })
    )
  }
  const target = lyricsDisplay()
  // Moved to another display (or that display's size changed): rebuild the overlay there.
  if (lyricsWin && (lyricsDisplayId !== target.id || !s.lyrics.overlay)) {
    lyricsWin.destroy()
    lyricsWin = null
  }
  if (s.lyrics.overlay && !lyricsWin) {
    lyricsWin = overlayWindow(target.bounds, 'lyrics')
    lyricsDisplayId = target.id
  }
  syncFullscreenWatch()
  broadcast() // which display the overlay is on decides whether it sits over the full-screen view
  rebuildTray()
}

// ---------- the tray's quick settings panel ----------
const QUICK = { width: 320, height: 640 }
let quickHiddenAt = 0

function toggleQuick() {
  // Clicking the tray icon while the panel is open first blurs (and hides) it: don't reopen.
  if (Date.now() - quickHiddenAt < 300) return
  if (quickWin && !quickWin.isDestroyed() && quickWin.isVisible()) return quickWin.hide()
  if (!quickWin || quickWin.isDestroyed()) {
    quickWin = new BrowserWindow({
      ...QUICK,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#141116',
      title: 'Glowtide',
      icon,
      // throttled: it does nothing while hidden, and gets fresh state each time it opens
      webPreferences: { ...prefs, backgroundThrottling: true }
    })
    quickWin.on('blur', () => {
      if (DEV && process.env.GLOWTIDE_QUICK) return // a test run keeps it open to photograph it
      quickHiddenAt = Date.now()
      quickWin?.hide()
    })
    quickWin.on('close', (e) => {
      if (!quitting) {
        e.preventDefault()
        quickWin.hide()
      }
    })
    quickWin.on('closed', () => (quickWin = null))
    load(quickWin, 'quick')
    quickWin.once('ready-to-show', () => placeQuick(true))
    return
  }
  placeQuick(true)
}

/** Beside the tray icon, inside the work area of the display the icon is on. */
function placeQuick(show) {
  if (!quickWin || quickWin.isDestroyed()) return
  const t = tray?.getBounds() || screen.getCursorScreenPoint()
  const d = screen.getDisplayNearestPoint({ x: t.x, y: t.y })
  const wa = d.workArea
  const h = Math.min(QUICK.height, wa.height - 16)
  const x = Math.round(
    Math.min(wa.x + wa.width - QUICK.width - 8, Math.max(wa.x + 8, t.x - QUICK.width / 2))
  )
  // the taskbar at the bottom (the usual place) or the top: the panel sits against it
  const y = t.y > wa.y + wa.height / 2 ? wa.y + wa.height - h - 8 : wa.y + 8
  quickWin.setBounds({ x, y, width: QUICK.width, height: h })
  if (show) {
    // it heard nothing while hidden: bring it up to date as it opens
    quickWin.webContents.send('state', state)
    quickWin.webContents.send('settings', loadSettings())
    quickWin.show()
    quickWin.focus()
  }
}

function rebuildTray() {
  if (!tray) return
  const s = loadSettings()
  const src = (value, label) => ({
    label,
    type: 'radio',
    checked: state.source === value,
    click: () => setSource(value)
  })
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show player', click: () => (player.show(), player.focus()) },
      { type: 'separator' },
      src('system', 'Any app'),
      src('spotify', 'Spotify'),
      src('youtube', 'YouTube Music'),
      src('demo', 'Demo'),
      { type: 'separator' },
      {
        label: 'Lyrics overlay',
        type: 'checkbox',
        checked: s.lyrics.overlay,
        click: () => setSettings({ lyrics: { overlay: !s.lyrics.overlay } })
      },
      {
        label: 'Edge glow',
        type: 'checkbox',
        checked: s.glow.enabled,
        click: () => setSettings({ glow: { enabled: !s.glow.enabled } })
      },
      { type: 'separator' },
      { label: 'Full screen (Ctrl+Alt+F)', click: () => widgets?.openStage() },
      { type: 'separator' },
      ...(state.update?.status === 'ready'
        ? [{ label: `Restart to update to ${state.update.version}`, click: installUpdate }]
        : []),
      { label: 'Quit Glowtide', click: () => ((quitting = true), app.quit()) }
    ])
  )
}

function installUpdate() {
  if (state.update?.status !== 'ready') return false
  quitting = true // the player's close button only hides it; this is a real quit
  return updater.install()
}

function setSettings(patch) {
  const before = loadSettings()
  const glowKey = (x) => JSON.stringify([x.glow.enabled, x.glow.displays, x.glow.taskbar])
  const prevGlow = glowKey(before)
  const prevLyr = JSON.stringify([before.lyrics.overlay, before.lyrics.display])
  const next = updateSettings(patch)
  if (
    glowKey(next) !== prevGlow ||
    JSON.stringify([next.lyrics.overlay, next.lyrics.display]) !== prevLyr
  )
    syncOverlays()
  else if (next.hideForFullscreen !== before.hideForFullscreen) syncFullscreenWatch()
  if (next.autoUpdate && !before.autoUpdate) updater.check()
  if (next.showInTaskbar !== before.showInTaskbar) player?.setSkipTaskbar(!next.showInTaskbar)
  sendSettings()
  syncAwake()
  return next
}

// ---------- ipc ----------
function registerIpc() {
  // Every handler answers only Glowtide's own pages (not a frame inside one, like YouTube's).
  const handle = (ch, fn) =>
    ipcMain.handle(ch, (e, ...args) => (trustedSender(e) ? fn(e, ...args) : undefined))
  const on = (ch, fn) => ipcMain.on(ch, (e, ...args) => trustedSender(e) && fn(e, ...args))
  handle('init', () => ({ state, settings: loadSettings(), lyrics: lyricsLines }))
  handle('update:check', () => updater.check())
  handle('update:install', () => installUpdate())
  handle('app:quit', () => {
    quitting = true
    app.quit()
  })
  handle('player:show', () => {
    quickWin?.hide()
    player?.show()
    player?.focus()
  })
  handle('quick:close', () => quickWin?.hide())
  handle('settings:set', (_, patch) => setSettings(patch))
  handle('control', (_, action, arg) => control(action, arg))
  handle('query', (_, kind, arg) => query(kind, arg))
  handle('source', (_, src) => setSource(src))
  handle('system:select', (_, appId) => {
    state.systemSelected = typeof appId === 'string' && appId ? appId.slice(0, 256) : 'auto'
    updateSettings({ systemApp: state.systemSelected })
    smtc.select(state.systemSelected)
    broadcast()
  })
  on('yt:state', (e, m) => {
    if (e.sender === player?.webContents) onYtMessage(m)
  })
  handle('lyrics:nudge', (_, delta) => {
    state.lyricsOffsetMs =
      delta === 0 ? 0 : Math.max(-5000, Math.min(5000, state.lyricsOffsetMs + delta))
    saveOffset(state.track, state.lyricsOffsetMs)
    broadcast()
  })
  handle('auth:connect', async () => {
    try {
      await spotifyAuth.signIn()
      state.connected = true
      state.spotifyPlan = null
      setSource('spotify')
      player?.show()
      player?.focus()
      return { ok: true }
    } catch (e) {
      return { error: e.message }
    }
  })
  handle('auth:disconnect', () => {
    spotifyAuth.signOut()
    state.connected = false
    state.spotifyPlan = null
    if (state.source === 'spotify') clearTrack()
    broadcast()
  })
  handle('google:connect', async () => {
    try {
      await googleAuth.signIn()
      state.google = true
      if (state.source !== 'youtube') setSource('youtube')
      else broadcast()
      player?.show()
      player?.focus()
      return { ok: true }
    } catch (e) {
      return { error: e.message }
    }
  })
  handle('google:disconnect', () => {
    googleAuth.signOut()
    state.google = false
    broadcast()
  })
  handle('stage', (_, action) => {
    if (action === 'close') widgets?.closeStage()
    else widgets?.openStage(player && screen.getDisplayMatching(player.getBounds()))
  })
  handle('displays', () => {
    const primary = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Display ${i + 1} · ${d.size.width}×${d.size.height}${d.id === primary ? ' (main)' : ''}`
    }))
  })
  handle('window', (_, action) => {
    if (action === 'minimize') player?.minimize()
    if (action === 'maximize') {
      if (player?.isFullScreen()) player.setFullScreen(false)
      else if (player?.isMaximized()) player.unmaximize()
      else player?.maximize()
    }
    if (action === 'close') player?.hide()
  })
  handle('open', (_, url) => {
    if (
      /^https:\/\/((developer|open|accounts)\.spotify\.com|console\.cloud\.google\.com|music\.youtube\.com)\//.test(
        url
      )
    )
      shell.openExternal(url)
  })
}

// ---------- debug snapshots (GLOWTIDE_SNAPSHOT=<dir>) ----------
function scheduleSnapshot() {
  const dir = DEV && process.env.GLOWTIDE_SNAPSHOT
  if (!dir) return
  const panel = process.env.GLOWTIDE_PANEL
  if (panel) setTimeout(() => player?.webContents.send('debug:panel', panel), 2500)
  if (process.env.GLOWTIDE_MAXIMIZE) setTimeout(() => player?.maximize(), 1200)
  if (process.env.GLOWTIDE_STAGE) setTimeout(() => widgets?.openStage(), 2000)
  // GLOWTIDE_AUDIT=1 (with GLOWTIDE_SNAPSHOT for the folder, GLOWTIDE_DEMO, GLOWTIDE_UNFOCUS): see audit.js.
  if (process.env.GLOWTIDE_AUDIT)
    setTimeout(async () => {
      const { runAudit } = await import('./audit')
      runAudit(
        {
          get player() {
            return player
          },
          get lyricsWin() {
            return lyricsWin
          },
          get glowWins() {
            return glowWins
          },
          get quickWin() {
            return quickWin
          },
          get widgets() {
            return widgets
          },
          state,
          setSettings,
          loadSettings,
          updateSettings,
          sendSettings,
          control,
          toggleQuick,
          fullscreen,
          quit: () => {
            quitting = true
            app.quit()
          }
        },
        dir
      )
    }, 4000)
  // GLOWTIDE_QUICK=1 opens the tray's quick panel; GLOWTIDE_PLAYER_SIZE="w,h" sizes the player;
  // GLOWTIDE_PLAYER_JS runs in the player at 2.5 s; GLOWTIDE_HOVER="<selector>" rests the pointer on
  // that element of the player (or of the quick panel, with GLOWTIDE_HOVER_IN=quick) 1.2 s
  // before the snapshot, so hover states show in it.
  if (process.env.GLOWTIDE_QUICK) setTimeout(() => toggleQuick(), 1500)
  if (process.env.GLOWTIDE_PLAYER_SIZE) {
    const [w, h] = process.env.GLOWTIDE_PLAYER_SIZE.split(',').map(Number)
    setTimeout(() => player?.setSize(w, h), 1000)
  }
  if (process.env.GLOWTIDE_PLAYER_JS)
    setTimeout(() => player?.webContents.executeJavaScript(process.env.GLOWTIDE_PLAYER_JS), 2500)
  if (process.env.GLOWTIDE_HOVER)
    setTimeout(
      async () => {
        const win = process.env.GLOWTIDE_HOVER_IN === 'quick' ? quickWin : player
        const r = await win?.webContents.executeJavaScript(
          `(() => { const b = document.querySelector(${JSON.stringify(process.env.GLOWTIDE_HOVER)})?.getBoundingClientRect(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`
        )
        if (!r) return
        const at = { x: Math.round(r.x), y: Math.round(r.y) }
        win.webContents.sendInputEvent({ type: 'mouseEnter', ...at })
        win.webContents.sendInputEvent({ type: 'mouseMove', ...at })
      },
      Number(process.env.GLOWTIDE_SNAPSHOT_MS || 6000) - 1200
    )
  // GLOWTIDE_SKY_PROBE=1: read the constellation's motion transforms twice, 2.5 s apart.
  if (process.env.GLOWTIDE_SKY_PROBE)
    setTimeout(async () => {
      // Also the words on the figure and where they sit, to check a word never moves once placed.
      const js = `(() => { const q = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).transform : null }; const fig = document.querySelector('.fig:not(.gone)'); return { cam: q('.fig:not(.gone)'), drift: q('.sky-drift'), field: q('.starfield'), figures: document.querySelectorAll('.fig').length, edges: fig ? fig.querySelectorAll('.sky-edge:not(.glow)').length : 0, stars: fig ? fig.querySelectorAll('.star').length : 0, words: fig ? [...fig.querySelectorAll('.sky-word')].map((t) => [t.textContent, t.getAttribute('x'), t.getAttribute('y'), t.getAttribute('class')]) : [], focus: fig?.querySelector('.focus')?.style.transform || null, cap: document.querySelector('.sky-caption .cap:not(.leave)')?.textContent || null } })()`
      const out = []
      for (let i = 0; i < 8; i++) {
        out.push(await lyricsWin?.webContents.executeJavaScript(js))
        await new Promise((r) => setTimeout(r, 1500))
      }
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'sky.json'), JSON.stringify(out, null, 1))
    }, 6000)
  // GLOWTIDE_PERF=<seconds>: CPU and memory per window over that many seconds, written to
  // perf.json. GLOWTIDE_PERF_HIDE=1 hides the player first, as when using another app.
  if (process.env.GLOWTIDE_PERF)
    setTimeout(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      if (process.env.GLOWTIDE_PERF_HIDE) player?.hide()
      await wait(4000)
      const names = new Map()
      const named = [
        ['player', player],
        ['lyrics', lyricsWin],
        ...glowWins.map((w, i) => [`glow${i}`, w]),
        ...(widgets ? widgets.windows() : []).map((w) => [w.widgetKind || 'stage', w])
      ]
      for (const [n, w] of named)
        if (w && !w.isDestroyed()) names.set(w.webContents.getOSProcessId(), n)
      app.getAppMetrics() // the first reading only starts the clock
      await wait(Number(process.env.GLOWTIDE_PERF) * 1000)
      const rows = app.getAppMetrics().map((p) => ({
        name: names.get(p.pid) || p.type,
        cpu: Math.round(p.cpu.percentCPUUsage * 10) / 10,
        wakeups: p.cpu.idleWakeupsPerSecond,
        mb: Math.round(p.memory.workingSetSize / 1024)
      }))
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'perf.json'),
        JSON.stringify(
          {
            playing: !!state.playback?.isPlaying,
            focused: state.playerFocused,
            gpu: app.getGPUFeatureStatus(),
            rows
          },
          null,
          1
        )
      )
    }, 3000)
  // GLOWTIDE_EVAL=<js>: evaluate an expression in the lyrics overlay after 9 s, into eval.json.
  if (process.env.GLOWTIDE_EVAL)
    setTimeout(async () => {
      const out = await lyricsWin?.webContents
        .executeJavaScript(process.env.GLOWTIDE_EVAL)
        .catch((e) => String(e))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'eval.json'), JSON.stringify(out, null, 1))
    }, 9000)
  // GLOWTIDE_FS_TEST=1: log whether each overlay is showing, on every change, for 40 s, into
  // fs.json (open a full-screen app meanwhile to see them step aside).
  if (process.env.GLOWTIDE_FS_TEST) {
    const log = []
    let last = ''
    const t0 = Date.now()
    const tick = setInterval(() => {
      const now = JSON.stringify({
        fullscreenApp: state.fullscreenApp,
        glow: glowWins.map((w) => !w.isDestroyed() && w.isVisible()),
        lyrics: !!lyricsWin && lyricsWin.isVisible(),
        widgets: widgets?.windows().map((w) => w.isVisible()),
        watching: fullscreen.running()
      })
      if (now !== last) log.push({ s: (Date.now() - t0) / 1000, ...JSON.parse(now) })
      last = now
      // CPU of the whole app, in cores, every two seconds
      if (log.length && Date.now() - (tick.cpuAt || 0) > 2000) {
        tick.cpuAt = Date.now()
        const names = new Map()
        for (const w of BrowserWindow.getAllWindows())
          names.set(
            w.webContents.getOSProcessId(),
            w === player
              ? 'player'
              : w === lyricsWin
                ? 'lyrics'
                : glowWins.includes(w)
                  ? 'glow'
                  : 'widget'
          )
        const by = {}
        for (const m of app.getAppMetrics()) {
          const k = names.get(m.pid) || m.type
          by[k] = +((by[k] || 0) + (m.cpu.percentCPUUsage * os.cpus().length) / 100).toFixed(2)
        }
        log.push({ s: (Date.now() - t0) / 1000, full: state.fullscreenApp, ...by })
      }
      if (Date.now() - t0 > 40000) {
        clearInterval(tick)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'fs.json'), JSON.stringify(log, null, 1))
      }
    }, 250)
  }
  // GLOWTIDE_SEC_TEST=1 (with the YouTube source): try what the guards in security.js refuse,
  // from Glowtide's own page and from YouTube's frame inside it, into sec.json.
  if (process.env.GLOWTIDE_SEC_TEST)
    setTimeout(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const capture =
        "navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then((s) => { const n = s.getAudioTracks().length; s.getTracks().forEach((t) => t.stop()); return 'granted, audio tracks: ' + n }, (e) => 'refused: ' + e.name)"
      const out = {}
      const wc = player.webContents
      out.appCapture = await wc.executeJavaScript(capture, true).catch((e) => 'error ' + e.message)
      const yt = wc.mainFrame.frames.find((fr) => fr.url.startsWith(YT_HOST_ORIGIN))
      out.ytFrame = yt ? yt.url : 'no frame'
      out.ytCapture = yt
        ? await yt.executeJavaScript(capture, true).catch((e) => 'error ' + e.message)
        : null
      out.ytHasBridge = yt ? await yt.executeJavaScript('typeof window.glowtide') : null
      out.ytGeolocation = yt
        ? await yt.executeJavaScript(
            "navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state)",
            true
          )
        : null
      const before = wc.getURL()
      await wc.executeJavaScript("location.href = 'https://example.com/'; 1")
      await wait(1500)
      out.navigationBlocked = wc.getURL() === before
      const windowsBefore = BrowserWindow.getAllWindows().length
      await wc.executeJavaScript("window.open('file:///C:/Windows/win.ini'); 1", true)
      await wait(800)
      out.popupBlocked = BrowserWindow.getAllWindows().length === windowsBefore
      out.devToolsAllowed = wc.isDevToolsOpened() || null
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'sec.json'), JSON.stringify(out, null, 1))
    }, 9000)
  // GLOWTIDE_UNFOCUS=1: hand focus to a throwaway window so the overlay shows, as when using another app.
  if (process.env.GLOWTIDE_UNFOCUS)
    setTimeout(() => {
      const other = new BrowserWindow({ width: 200, height: 120, x: 0, y: 0, skipTaskbar: true })
      other.focus()
    }, 1500)
  // GLOWTIDE_FOCUS_TEST=1: record the overlay's visibility with Glowtide's window unfocused, then focused.
  if (process.env.GLOWTIDE_FOCUS_TEST) {
    const stage = () =>
      lyricsWin?.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.lyr-stage')).opacity"
      )
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    setTimeout(async () => {
      // Clicking into another app: a throwaway window takes focus.
      const other = new BrowserWindow({ width: 300, height: 200, x: 0, y: 0 })
      other.focus()
      await wait(1200)
      const blurred = { focused: state.playerFocused, opacity: await stage() }
      player.focus()
      await wait(1200)
      const focused = { focused: state.playerFocused, opacity: await stage() }
      other.destroy()
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'focus.json'), JSON.stringify({ blurred, focused }))
    }, 4000)
  }
  // GLOWTIDE_SYS_TEST=<app id>: follow that app; GLOWTIDE_SYS_TEST_CMD=<command>: send it after 6 s.
  const sysTest = process.env.GLOWTIDE_SYS_TEST
  if (sysTest)
    setTimeout(() => {
      setSource('system')
      state.systemSelected = sysTest
      smtc.select(sysTest)
      const cmd = process.env.GLOWTIDE_SYS_TEST_CMD
      if (cmd) setTimeout(() => control(...cmd.split(' ')), 6000)
    }, 1000)
  const ytTest = process.env.GLOWTIDE_YT_TEST
  if (ytTest)
    setTimeout(() => {
      setSource('youtube')
      setTimeout(() => control('playItems', { items: [{ videoId: ytTest }] }), 1500)
    }, 1500)
  setTimeout(
    async () => {
      mkdirSync(dir, { recursive: true })
      const wins = [
        ['player', player],
        ['lyrics', lyricsWin],
        ['quick', quickWin],
        ...glowWins.map((w, i) => [`glow${i}`, w]),
        ...(widgets ? widgets.windows() : []).map((w) => [w.widgetKind || 'stage', w])
      ]
      for (const [name, w] of wins) {
        if (!w || w.isDestroyed() || !w.isVisible()) continue
        // Transparent overlays capture over nothing: paint a dark desktop behind them first.
        if (w !== player && w !== quickWin)
          await w.webContents.executeJavaScript(
            "document.body.style.background='#14161c'; new Promise(r => setTimeout(r, 120))"
          )
        const img = await w.webContents.capturePage()
        writeFileSync(join(dir, `${name}${panel ? '-' + panel : ''}.png`), img.toPNG())
      }
      // What the overlay's current word is doing, sampled twice, to see the fill move.
      let overlay = null
      if (lyricsWin && !lyricsWin.isDestroyed()) {
        const probe = `(() => { const el = document.querySelector('.w.cur:not(.leave), .aura-text:not(.leave), .wave-line:not(.leave), .beat-text:not(.leave), .sky-caption .cap:not(.leave), .k-line'); if (!el) return null;
          const cs = getComputedStyle(el); return { cls: el.className, word: el.textContent.length, text: el.textContent, at: Date.now(), fills: [...document.querySelectorAll('.k-word')].map((x) => +getComputedStyle(x).getPropertyValue('--f') || 0), leaving: [...document.querySelectorAll('.leave')].map((x) => +getComputedStyle(x).opacity),
          bg: cs.backgroundPosition, anim: cs.animationName, dur: cs.animationDuration } })()`
        overlay = []
        for (let i = 0; i < Number(process.env.GLOWTIDE_PROBE_N || 25); i++) {
          overlay.push(await lyricsWin.webContents.executeJavaScript(probe))
          await new Promise((r) => setTimeout(r, 80))
        }
      }
      // The edge glow's travelling light: its angle, read twice half a second apart.
      let flow = null
      if (glowWins[0] && !glowWins[0].isDestroyed()) {
        const read = () =>
          glowWins[0].webContents.executeJavaScript(
            "document.querySelector('.flow-frame i')?.style.transform || null"
          )
        const a = await read()
        await new Promise((r) => setTimeout(r, 500))
        flow = [a, await read()]
      }
      writeFileSync(
        join(dir, 'state.json'),
        JSON.stringify(
          {
            flow,
            glowBounds: glowWins.map((w) => !w.isDestroyed() && w.getBounds()),
            ...state,
            lyricsCount: lyricsLines.length,
            overlay,
            lines: process.env.GLOWTIDE_DUMP_LINES ? lyricsLines : undefined
          },
          null,
          2
        )
      )
      quitting = true
      app.quit()
    },
    Number(process.env.GLOWTIDE_SNAPSHOT_MS || 6000)
  )
}

// ---------- app ----------
// GLOWTIDE_PROFILE=<dir>: a separate settings folder and single-instance lock, so a test run
// never touches the user's settings or closes the Glowtide they have open.
if (DEV && process.env.GLOWTIDE_PROFILE) app.setPath('userData', process.env.GLOWTIDE_PROFILE)

hardenContents()

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    player?.show()
    player?.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('io.github.cynicalk.glowtide')
    // No application menu in an installed copy: it would carry Reload and Developer Tools.
    if (!DEV) Menu.setApplicationMenu(null)
    if (DEV && process.env.GLOWTIDE_FRESH)
      rmSync(join(app.getPath('userData'), 'settings.json'), { force: true })
    const s = loadSettings()
    state.connected = spotifyAuth.load()
    state.google = googleAuth.load()
    state.source = DEV && process.env.GLOWTIDE_DEMO === '1' ? 'demo' : s.source
    state.demo = state.source === 'demo'
    state.systemSelected = s.systemApp || 'auto'
    smtc.select(state.systemSelected)
    if (state.source === 'system') smtc.start()

    try {
      await startYtHost()
    } catch (e) {
      state.error = `YouTube player couldn't start (${e.message}).`
    }

    // Edge glow reacts to what the PC is playing: system audio loopback, never the
    // microphone, and only for Glowtide's own pages (see security.js).
    hardenSession(session.defaultSession, () =>
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => sources[0])
    )

    loadAmllIndex() // warm the word-timed lyrics index so the first song doesn't wait
    registerIpc()
    createPlayer()
    syncOverlays()
    widgets = createWidgets({
      load,
      prefs,
      onWindowsChanged: () => {
        sendSettings()
        broadcast()
        sendLyrics()
      }
    })
    syncFullscreenWatch()
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
    tray.setToolTip('Glowtide')
    // Ctrl+Alt+L turns the lyrics overlay on and off from anywhere.
    try {
      globalShortcut.register('CommandOrControl+Alt+L', () =>
        setSettings({ lyrics: { overlay: !loadSettings().lyrics.overlay } })
      )
    } catch {
      /* another app owns the shortcut: the tray and the Lyrics button still work */
    }
    // Ctrl+Alt+F is the full-screen view.
    try {
      globalShortcut.register('CommandOrControl+Alt+F', () =>
        widgets?.toggleStage(player && screen.getDisplayMatching(player.getBounds()))
      )
    } catch {
      /* taken by another app: the settings buttons still work */
    }
    // A click opens the quick settings panel by the tray icon (as Glowtide's menu-bar panel does
    // on a Mac); a double-click opens the player. The right-click menu is unchanged.
    tray.on('click', () => toggleQuick())
    tray.on('double-click', () => {
      quickWin?.hide()
      player.show()
      player.focus()
    })
    rebuildTray()
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed'])
      screen.on(ev, () => syncOverlays())
    poll()
    scheduleSnapshot()
    state.update = { ...updater.state }
    updater.start()
  })

  app.on('before-quit', () => {
    quitting = true
    globalShortcut.unregisterAll()
    updater.stop()
    fullscreen.stop()
    smtc.stop()
  })
  app.on('window-all-closed', () => {
    /* stay in the tray */
  })
}

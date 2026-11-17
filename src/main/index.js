import {
  app,
  BrowserWindow,
  globalShortcut,
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
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, updateSettings } from './settings'
import { REDIRECT_URI } from './oauth'
import { createSpotify, createSpotifyAuth, slimTrack } from './spotify'
import { createGoogleAuth, createYouTube } from './youtube'
import { startYtHost, YT_HOST_ORIGIN } from './ytHost'
import { fetchLyrics } from './lyricsSource'
import { loadAmllIndex } from './amll'
import { createDemo } from './demo'
import { extractPalette } from '../shared/colour.mjs'
import { parseYouTubeTitle, YT_ERRORS } from '../shared/youtube.mjs'
import { appLabel, systemTrack, repeatFromSmtc } from '../shared/media.mjs'
import { createSmtc } from './smtc'

const spotifyAuth = createSpotifyAuth(() => loadSettings().clientId)
const spotify = createSpotify(spotifyAuth)
const googleAuth = createGoogleAuth(() => ({
  clientId: loadSettings().googleClientId,
  clientSecret: loadSettings().googleClientSecret
}))
const yt = createYouTube(googleAuth)
const demo = createDemo()
const smtc = createSmtc((m) => onSystemMessage(m))

let player = null
let lyricsWin = null
let glowWins = []
let tray = null
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
  playerFocused: false
}
let lyricsLines = []
const ytMeta = new Map() // videoId -> metadata from our own API calls (cleaner than player titles)
let ytShuffle = false
let ytRepeat = 'off'
let ytErrorVideo = null

function all() {
  return [player, lyricsWin, ...glowWins].filter((w) => w && !w.isDestroyed())
}
function broadcast() {
  for (const w of all()) w.webContents.send('state', state)
}
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
  state.lyricsOffsetMs = 0 // the nudge is per song
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
        state.lyricsOffsetMs = 0
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
      if (state.error && !/Premium|device/i.test(state.error)) state.error = null
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
      .filter((id) => process.env.GLOWTIDE_SYS_TEST || id !== 'io.github.cynicalk.glowtide')
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
      for (const v of arg.items || []) ytMeta.set(v.videoId, v)
      ytCommand('load', {
        videoIds: arg.items?.map((v) => v.videoId),
        playlistId: arg.playlistId,
        index: arg.index || 0
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
    if (action === 'play') await s.play()
    else if (action === 'pause') await s.pause()
    else if (action === 'next') await s.next()
    else if (action === 'previous') await s.previous()
    else if (action === 'seek') await s.seek(arg)
    else if (action === 'shuffle') await s.shuffle(arg)
    else if (action === 'repeat') await s.repeat(arg)
    else if (action === 'volume') await s.volume(arg)
    else if (action === 'transfer') await s.transfer(arg)
    else if (action === 'queue') await s.addToQueue(arg)
    else if (action === 'playItems') await s.play(arg)
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
  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/${route}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
}

const prefs = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false,
  backgroundThrottling: false
}

function createPlayer() {
  player = new BrowserWindow({
    width: 400,
    height: 680,
    minWidth: 360,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#070608',
    title: 'Glowtide',
    icon,
    webPreferences: { ...prefs, autoplayPolicy: 'no-user-gesture-required' }
  })
  player.on('ready-to-show', () => player.show())
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
  for (const ev of ['blur', 'hide', 'minimize']) player.on(ev, () => setFocused(false))
  player.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  load(player, 'player')
}

function overlayWindow(bounds, route) {
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
  w.on('ready-to-show', () => w.showInactive())
  load(w, route)
  return w
}

function syncOverlays() {
  const s = loadSettings()
  for (const w of glowWins) if (!w.isDestroyed()) w.destroy()
  glowWins = []
  if (s.glow.enabled) {
    const displays =
      s.glow.displays === 'primary' ? [screen.getPrimaryDisplay()] : screen.getAllDisplays()
    glowWins = displays.map((d, i) => overlayWindow(d.bounds, `glow?d=${i}`))
  }
  if (s.lyrics.overlay && !lyricsWin)
    lyricsWin = overlayWindow(screen.getPrimaryDisplay().bounds, 'lyrics')
  if (!s.lyrics.overlay && lyricsWin) {
    lyricsWin.destroy()
    lyricsWin = null
  }
  rebuildTray()
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
      { label: 'Quit Glowtide', click: () => ((quitting = true), app.quit()) }
    ])
  )
}

function setSettings(patch) {
  const before = loadSettings()
  const prevGlow = JSON.stringify([before.glow.enabled, before.glow.displays])
  const prevLyr = before.lyrics.overlay
  const next = updateSettings(patch)
  if (
    JSON.stringify([next.glow.enabled, next.glow.displays]) !== prevGlow ||
    next.lyrics.overlay !== prevLyr
  )
    syncOverlays()
  sendSettings()
  return next
}

// ---------- ipc ----------
function registerIpc() {
  ipcMain.handle('init', () => ({ state, settings: loadSettings(), lyrics: lyricsLines }))
  ipcMain.handle('settings:set', (_, patch) => setSettings(patch))
  ipcMain.handle('control', (_, action, arg) => control(action, arg))
  ipcMain.handle('query', (_, kind, arg) => query(kind, arg))
  ipcMain.handle('source', (_, src) => setSource(src))
  ipcMain.handle('system:select', (_, appId) => {
    state.systemSelected = appId || 'auto'
    updateSettings({ systemApp: state.systemSelected })
    smtc.select(state.systemSelected)
    broadcast()
  })
  ipcMain.on('yt:state', (e, m) => {
    if (e.sender === player?.webContents) onYtMessage(m)
  })
  ipcMain.handle('lyrics:nudge', (_, delta) => {
    state.lyricsOffsetMs =
      delta === 0 ? 0 : Math.max(-5000, Math.min(5000, state.lyricsOffsetMs + delta))
    broadcast()
  })
  ipcMain.handle('auth:connect', async () => {
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
  ipcMain.handle('auth:disconnect', () => {
    spotifyAuth.signOut()
    state.connected = false
    state.spotifyPlan = null
    if (state.source === 'spotify') clearTrack()
    broadcast()
  })
  ipcMain.handle('google:connect', async () => {
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
  ipcMain.handle('google:disconnect', () => {
    googleAuth.signOut()
    state.google = false
    broadcast()
  })
  ipcMain.handle('window', (_, action) => {
    if (action === 'minimize') player?.minimize()
    if (action === 'close') player?.hide()
  })
  ipcMain.handle('open', (_, url) => {
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
  const dir = process.env.GLOWTIDE_SNAPSHOT
  if (!dir) return
  const panel = process.env.GLOWTIDE_PANEL
  if (panel) setTimeout(() => player?.webContents.send('debug:panel', panel), 2500)
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
        ...glowWins.map((w, i) => [`glow${i}`, w])
      ]
      for (const [name, w] of wins) {
        if (!w || w.isDestroyed()) continue
        // Transparent overlays capture over nothing: paint a dark desktop behind them first.
        if (w !== player)
          await w.webContents.executeJavaScript(
            "document.body.style.background='#14161c'; new Promise(r => setTimeout(r, 120))"
          )
        const img = await w.webContents.capturePage()
        writeFileSync(join(dir, `${name}${panel ? '-' + panel : ''}.png`), img.toPNG())
      }
      // What the overlay's current word is doing, sampled twice, to see the fill move.
      let overlay = null
      if (lyricsWin && !lyricsWin.isDestroyed()) {
        const probe = `(() => { const el = document.querySelector('.w.cur'); if (!el) return null;
          const cs = getComputedStyle(el); return { cls: el.className, word: el.textContent.length, text: el.textContent, at: Date.now(),
          bg: cs.backgroundPosition, anim: cs.animationName, dur: cs.animationDuration } })()`
        overlay = []
        for (let i = 0; i < 25; i++) {
          overlay.push(await lyricsWin.webContents.executeJavaScript(probe))
          await new Promise((r) => setTimeout(r, 80))
        }
      }
      writeFileSync(
        join(dir, 'state.json'),
        JSON.stringify(
          {
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
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    player?.show()
    player?.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('io.github.cynicalk.glowtide')
    if (process.env.GLOWTIDE_FRESH)
      rmSync(join(app.getPath('userData'), 'settings.json'), { force: true })
    const s = loadSettings()
    state.connected = spotifyAuth.load()
    state.google = googleAuth.load()
    state.source = process.env.GLOWTIDE_DEMO === '1' ? 'demo' : s.source
    state.demo = state.source === 'demo'
    state.systemSelected = s.systemApp || 'auto'
    smtc.select(state.systemSelected)
    if (state.source === 'system') smtc.start()

    try {
      await startYtHost()
    } catch (e) {
      state.error = `YouTube player couldn't start (${e.message}).`
    }

    // Edge glow reacts to what the PC is playing: system audio loopback, never the microphone.
    session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => cb({ video: sources[0], audio: 'loopback' }))
        .catch(() => cb({}))
    })

    loadAmllIndex() // warm the word-timed lyrics index so the first song doesn't wait
    registerIpc()
    createPlayer()
    syncOverlays()
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
    tray.on('click', () => (player.isVisible() ? player.focus() : player.show()))
    rebuildTray()
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed'])
      screen.on(ev, () => syncOverlays())
    poll()
    scheduleSnapshot()
  })

  app.on('before-quit', () => {
    quitting = true
    globalShortcut.unregisterAll()
    smtc.stop()
  })
  app.on('window-all-closed', () => {
    /* stay in the tray */
  })
}

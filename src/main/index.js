import {
  app,
  BrowserWindow,
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
import { writeFileSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, updateSettings } from './settings'
import { loadTokens, isConnected, signIn, signOut, REDIRECT_URI } from './auth'
import { createSpotify, slimTrack } from './spotify'
import { fetchLyrics } from './lyricsSource'
import { createDemo } from './demo'
import { extractPalette } from '../shared/colour.mjs'

const spotify = createSpotify(() => loadSettings().clientId)
const demo = createDemo()

let player = null
let lyricsWin = null
let glowWins = []
let tray = null
let quitting = false

// ---------- state ----------
const state = {
  connected: false,
  demo: process.env.GLOWTIDE_DEMO === '1',
  track: null,
  palette: null,
  playback: null,
  liked: null,
  lyricsStatus: 'none',
  lyricsOffsetMs: 0,
  error: null,
  redirectUri: REDIRECT_URI
}
let lyricsLines = []

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

async function paletteFor(url) {
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return null
    const small = img.resize({ width: 64, height: 64, quality: 'good' })
    return extractPalette(small.toBitmap(), { order: 'bgra' })
  } catch {
    return null
  }
}

async function onTrackChange(track) {
  state.palette = null
  state.liked = null
  state.lyricsOffsetMs = 0 // the nudge is per song
  state.lyricsStatus = 'loading'
  lyricsLines = []
  sendLyrics()
  const id = track.id
  paletteFor(track.cover).then((p) => {
    if (state.track?.id === id) {
      state.palette = p
      broadcast()
    }
  })
  fetchLyrics(track).then((l) => {
    if (state.track?.id !== id) return
    state.lyricsStatus = l.status
    lyricsLines = l.lines
    sendLyrics()
    broadcast()
  })
  if (id && !id.startsWith('demo')) {
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

let pollTimer = null
async function poll() {
  clearTimeout(pollTimer)
  let delay = 2500
  try {
    if (state.demo) {
      const s = demo.snapshot()
      if (s.track.id !== state.track?.id) {
        state.track = s.track
        state.palette = s.palette
        state.lyricsOffsetMs = 0
        state.lyricsStatus = s.lyrics.status
        lyricsLines = s.lyrics.lines
        sendLyrics()
      }
      state.playback = s.playback
      state.liked = null
      state.error = null
      delay = 1000
    } else if (isConnected() && loadSettings().clientId) {
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
  } catch (e) {
    state.error = e.message
    delay = 4000
  }
  state.connected = isConnected()
  broadcast()
  pollTimer = setTimeout(poll, delay)
}

async function control(action, arg) {
  if (state.demo) {
    demo.control(action, arg)
    return poll()
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
    state.error = e.message
    broadcast()
    return { error: e.message }
  }
  setTimeout(poll, 350)
  return { ok: true }
}

async function query(kind, arg) {
  if (state.demo) {
    if (kind === 'demoTracks') return demo.tracks.map(({ palette, ...t }) => t) // eslint-disable-line no-unused-vars
    return { demo: true }
  }
  try {
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
    webPreferences: prefs
  })
  player.on('ready-to-show', () => player.show())
  player.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      player.hide()
    }
  })
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
  // edge glow: one window per display
  for (const w of glowWins) if (!w.isDestroyed()) w.destroy()
  glowWins = []
  if (s.glow.enabled) {
    const displays =
      s.glow.displays === 'primary' ? [screen.getPrimaryDisplay()] : screen.getAllDisplays()
    glowWins = displays.map((d, i) => overlayWindow(d.bounds, `glow?d=${i}`))
  }
  // lyrics: primary display
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show player', click: () => (player.show(), player.focus()) },
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
      {
        label: 'Demo mode',
        type: 'checkbox',
        checked: state.demo,
        click: () => setDemo(!state.demo)
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

function setDemo(on) {
  state.demo = on
  state.track = null
  state.palette = null
  state.playback = null
  lyricsLines = []
  sendLyrics()
  rebuildTray()
  poll()
}

// ---------- ipc ----------
function registerIpc() {
  ipcMain.handle('init', () => ({ state, settings: loadSettings(), lyrics: lyricsLines }))
  ipcMain.handle('settings:set', (_, patch) => setSettings(patch))
  ipcMain.handle('control', (_, action, arg) => control(action, arg))
  ipcMain.handle('query', (_, kind, arg) => query(kind, arg))
  ipcMain.handle('demo', (_, on) => setDemo(on))
  ipcMain.handle('lyrics:nudge', (_, delta) => {
    state.lyricsOffsetMs =
      delta === 0 ? 0 : Math.max(-5000, Math.min(5000, state.lyricsOffsetMs + delta))
    broadcast()
  })
  ipcMain.handle('auth:connect', async () => {
    try {
      await signIn(loadSettings().clientId)
      state.connected = true
      state.error = null
      if (state.demo) setDemo(false)
      else poll()
      player?.show()
      player?.focus()
      return { ok: true }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('auth:disconnect', () => {
    signOut()
    state.connected = false
    state.track = null
    state.playback = null
    broadcast()
  })
  ipcMain.handle('window', (_, action) => {
    if (action === 'minimize') player?.minimize()
    if (action === 'close') player?.hide()
  })
  ipcMain.handle('open', (_, url) => {
    if (/^https:\/\/(developer|open|accounts)\.spotify\.com\//.test(url)) shell.openExternal(url)
  })
}

// ---------- debug snapshots (GLOWTIDE_SNAPSHOT=<dir>) ----------
function scheduleSnapshot() {
  const dir = process.env.GLOWTIDE_SNAPSHOT
  if (!dir) return
  const panel = process.env.GLOWTIDE_PANEL
  if (panel) setTimeout(() => player?.webContents.send('debug:panel', panel), 2500)
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

  app.whenReady().then(() => {
    app.setAppUserModelId('io.github.cynicalk.glowtide')
    loadSettings()
    state.connected = loadTokens()

    // Edge glow reacts to what the PC is playing: system audio loopback, never the microphone.
    session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => cb({ video: sources[0], audio: 'loopback' }))
        .catch(() => cb({}))
    })

    registerIpc()
    createPlayer()
    syncOverlays()
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
    tray.setToolTip('Glowtide')
    tray.on('click', () => (player.isVisible() ? player.focus() : player.show()))
    rebuildTray()
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed'])
      screen.on(ev, () => syncOverlays())
    poll()
    scheduleSnapshot()
  })

  app.on('before-quit', () => (quitting = true))
  app.on('window-all-closed', () => {
    /* stay in the tray */
  })
}

// Desktop widgets (the visualizer and the clock) and the full-screen view.
//
// A widget lives in one of three places:
//   wallpaper  re-parented into the desktop wallpaper: behind the icons and every window,
//              not in Alt-Tab or the taskbar, surviving Win+D
//   top        a floating window above everything
//   window     an ordinary window you can drag, resize and cover
// Moving and resizing (in "top" or "window") is remembered; the wallpaper uses the same spot.

import { BrowserWindow, screen } from 'electron'
import { createWallpaper } from './wallpaper'

const DEFAULTS = {
  viz: { width: 560, height: 300, dx: -40, dy: 40 },
  clock: { width: 460, height: 180, dx: -40, dy: 360 }
}

export function createWidgets({ load, prefs, loadSettings, updateSettings, onWindowsChanged }) {
  const wall = createWallpaper()
  const wins = { viz: null, clock: null }
  let stage = null
  let hidden = false
  let saveTimer = null

  function boundsFor(kind) {
    const saved = loadSettings().widgets[kind].bounds
    const wa = screen.getPrimaryDisplay().workArea
    const d = DEFAULTS[kind]
    const b = saved || {
      x: wa.x + wa.width - d.width + d.dx,
      y: wa.y + d.dy,
      width: d.width,
      height: d.height
    }
    // keep it on a display that still exists
    const on = screen.getDisplayMatching(b).workArea
    return {
      ...b,
      x: Math.min(Math.max(b.x, on.x), on.x + on.width - 80),
      y: Math.min(Math.max(b.y, on.y), on.y + on.height - 60)
    }
  }

  function remember(kind, win) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      updateSettings({ widgets: { [kind]: { bounds: win.getBounds() } } })
    }, 400)
  }

  async function create(kind) {
    const cfg = loadSettings().widgets[kind]
    const place = cfg.placement || 'wallpaper'
    const b = boundsFor(kind)
    const win = new BrowserWindow({
      ...b,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: place !== 'window',
      resizable: place !== 'wallpaper',
      movable: place !== 'wallpaper',
      focusable: place !== 'wallpaper',
      alwaysOnTop: place === 'top',
      minWidth: 200,
      minHeight: 100,
      title: kind === 'viz' ? 'Glowtide visualizer' : 'Glowtide clock',
      webPreferences: prefs
    })
    win.widgetKind = kind
    win.widgetPlace = place
    if (place === 'top') win.setAlwaysOnTop(true, 'floating')
    win.on('moved', () => remember(kind, win))
    win.on('resized', () => remember(kind, win))
    load(win, `${kind === 'viz' ? 'widget' : 'clock'}?place=${place}`)
    await new Promise((r) => win.once('ready-to-show', r))
    if (place === 'wallpaper') {
      const scale = screen.getDisplayMatching(b).scaleFactor
      win.showInactive()
      const res = await wall.attach(win, b, scale)
      if (res !== 'attached') {
        // No wallpaper layer to join (an unusual shell): fall back to a window under others.
        win.setAlwaysOnTop(false)
        win.moveTop()
      }
      win.wallpaperResult = res
    } else {
      win.showInactive()
    }
    if (hidden) win.hide()
    return win
  }

  async function sync() {
    const s = loadSettings().widgets
    for (const kind of ['viz', 'clock']) {
      const want = s[kind].enabled
      const cur = wins[kind]
      const place = s[kind].placement || 'wallpaper'
      if (cur && (!want || cur.widgetPlace !== place || cur.isDestroyed())) {
        if (!cur.isDestroyed()) cur.destroy()
        wins[kind] = null
      }
      if (want && !wins[kind]) wins[kind] = await create(kind)
    }
    onWindowsChanged()
  }

  // Explorer restarting (or a wallpaper change) replaces the wallpaper's window: re-join it.
  const guard = setInterval(async () => {
    for (const kind of ['viz', 'clock']) {
      const w = wins[kind]
      if (!w || w.isDestroyed() || w.widgetPlace !== 'wallpaper' || hidden) continue
      if ((await wall.check(w)) === 'loose') {
        const b = boundsFor(kind)
        await wall.attach(w, b, screen.getDisplayMatching(b).scaleFactor)
      }
    }
  }, 15000)

  function toggleHidden() {
    hidden = !hidden
    for (const w of Object.values(wins))
      if (w && !w.isDestroyed()) hidden ? w.hide() : w.showInactive()
    return hidden
  }

  function openStage(display) {
    if (stage && !stage.isDestroyed()) {
      stage.focus()
      return stage
    }
    const d = display || screen.getPrimaryDisplay()
    stage = new BrowserWindow({
      ...d.bounds,
      show: false,
      frame: false,
      backgroundColor: '#000000',
      fullscreen: true,
      title: 'Glowtide',
      webPreferences: prefs
    })
    stage.on('closed', () => {
      stage = null
      onWindowsChanged()
    })
    load(stage, 'stage')
    stage.once('ready-to-show', () => {
      stage.show()
      stage.focus()
    })
    onWindowsChanged()
    return stage
  }

  function closeStage() {
    if (stage && !stage.isDestroyed()) stage.close()
  }

  return {
    sync,
    toggleHidden,
    openStage,
    closeStage,
    toggleStage: (d) => (stage && !stage.isDestroyed() ? closeStage() : openStage(d)),
    windows: () => [wins.viz, wins.clock, stage].filter((w) => w && !w.isDestroyed()),
    stop() {
      clearInterval(guard)
      wall.stop()
    }
  }
}

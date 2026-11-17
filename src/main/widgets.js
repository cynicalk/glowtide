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

  // "edit": lifted off the wallpaper so it can be dragged and resized, then put back.
  const editing = { viz: false, clock: false }

  async function create(kind, override) {
    const cfg = loadSettings().widgets[kind]
    const place = override || cfg.placement || 'wallpaper'
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
      maximizable: false,
      alwaysOnTop: place === 'top' || place === 'edit',
      minWidth: 200,
      minHeight: 100,
      title: kind === 'viz' ? 'Glowtide visualizer' : 'Glowtide clock',
      webPreferences: prefs
    })
    win.widgetKind = kind
    win.widgetPlace = place
    if (place === 'top') win.setAlwaysOnTop(true, 'floating')
    if (place === 'edit') win.setAlwaysOnTop(true, 'screen-saver')
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
    } else if (place === 'edit') {
      win.show()
      win.focus()
    } else {
      win.showInactive()
    }
    if (hidden && place !== 'edit') win.hide()
    return win
  }

  async function sync() {
    const s = loadSettings().widgets
    for (const kind of ['viz', 'clock']) {
      if (editing[kind]) continue // being moved: leave it alone until Done
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

  /** Lift a widget off the wallpaper so it can be moved and resized. */
  async function edit(kind) {
    if (!loadSettings().widgets[kind].enabled || editing[kind]) return
    editing[kind] = true
    const cur = wins[kind]
    if (cur && !cur.isDestroyed()) cur.destroy()
    wins[kind] = await create(kind, 'edit')
    onWindowsChanged()
  }

  /** Keep the new spot and size, and put the widget back where it lives. */
  async function done(kind) {
    const cur = wins[kind]
    if (cur && !cur.isDestroyed()) {
      updateSettings({ widgets: { [kind]: { bounds: cur.getBounds() } } })
      cur.destroy()
    }
    wins[kind] = null
    editing[kind] = false
    await sync()
  }

  /** Resize from the widget's own corner grip (see-through windows have no resize edges). */
  function resize(kind, width, height) {
    const w = wins[kind]
    if (!w || w.isDestroyed() || w.widgetPlace === 'wallpaper') return
    const b = w.getBounds()
    w.setBounds({
      ...b,
      width: Math.max(200, Math.round(width)),
      height: Math.max(100, Math.round(height))
    })
    remember(kind, w)
  }

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
    edit,
    done,
    resize,
    sizeOf: (kind) => wins[kind]?.getBounds(),
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

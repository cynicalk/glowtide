// The full-screen view (Ctrl+Alt+F): a window of its own on one display.

import { BrowserWindow, screen } from 'electron'

export function createWidgets({ load, prefs, onWindowsChanged }) {
  let stage = null

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
    /** The display the full-screen view is open on, or null. */
    stageDisplay: () =>
      stage && !stage.isDestroyed() ? screen.getDisplayMatching(stage.getBounds()).id : null,
    openStage,
    closeStage,
    toggleStage: (d) => (stage && !stage.isDestroyed() ? closeStage() : openStage(d)),
    windows: () => (stage && !stage.isDestroyed() ? [stage] : [])
  }
}

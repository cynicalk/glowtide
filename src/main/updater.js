// Updates from Glowtide's GitHub releases (the publish settings in electron-builder.yml).
//
// Glowtide checks shortly after it starts and every six hours, downloads a newer release in the
// background, and offers a restart. If the restart is declined, the update installs the next
// time Glowtide quits. electron-updater verifies the download against the SHA-512 in the
// release's latest.yml before running it. Only full releases are offered, never drafts or
// pre-releases. A development run never checks.

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

const FIRST_CHECK_MS = 20 * 1000
const EVERY_MS = 6 * 60 * 60 * 1000

/**
 * onChange(state) on every change. state.status is one of:
 *   'dev'          a development run: updates are off
 *   'idle'         not checked yet
 *   'checking'
 *   'current'      this is the latest release
 *   'downloading'  state.version, state.percent
 *   'ready'        state.version is downloaded and installs on restart
 *   'error'        the last check or download failed (offline, or GitHub unreachable)
 *
 * devFeed: in a development run only, a generic update feed (a folder served over http) to
 * test the whole download and install against.
 */
export function createUpdater({ onChange, onError, automatic, devFeed }) {
  const packaged = app.isPackaged || !!devFeed
  const state = {
    current: app.getVersion(),
    status: packaged ? 'idle' : 'dev',
    version: null,
    percent: 0
  }
  const set = (patch) => {
    Object.assign(state, patch)
    onChange({ ...state })
  }
  if (!packaged) return { state, check() {}, install: () => false, start() {}, stop() {} }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null
  if (devFeed) {
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.setFeedURL({ provider: 'generic', url: devFeed })
  }

  autoUpdater.on('checking-for-update', () => {
    if (state.status !== 'downloading' && state.status !== 'ready') set({ status: 'checking' })
  })
  autoUpdater.on('update-not-available', () => set({ status: 'current', version: null }))
  autoUpdater.on('update-available', (info) =>
    set({ status: 'downloading', version: info.version, percent: 0 })
  )
  autoUpdater.on('download-progress', (p) => {
    const percent = Math.floor(p.percent || 0)
    if (percent !== state.percent) set({ percent })
  })
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => {
    onError?.(e)
    // A download that was already finished stays ready; anything else is a failed check.
    if (state.status !== 'ready') set({ status: 'error' })
  })

  let timer = null
  let first = null
  function check() {
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready')
      return
    autoUpdater.checkForUpdates().catch(() => {}) // reported through the 'error' event
  }

  return {
    state,
    check,
    /** Quit and install the downloaded update, then start the new version. */
    install() {
      if (state.status !== 'ready') return false
      autoUpdater.quitAndInstall(true, true)
      return true
    },
    /** Periodic checks, if automatic() says they're wanted. */
    start() {
      if (timer) return
      first = setTimeout(() => automatic() && check(), FIRST_CHECK_MS)
      timer = setInterval(() => automatic() && check(), EVERY_MS)
    },
    stop() {
      clearTimeout(first)
      clearInterval(timer)
      timer = first = null
    }
  }
}

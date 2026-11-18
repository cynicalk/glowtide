// Guards for every window Glowtide opens. Glowtide's own pages are trusted; everything else that
// can end up inside a window (YouTube's embedded player, a link in a page) is not.
//
// - Only Glowtide's own page may be loaded in a window: navigation elsewhere is refused, new
//   windows are refused (the player opens https links in the browser instead), and
//   <webview> is never attached.
// - Permissions are an allowlist. Screen and system-audio capture (used for the beat) is
//   granted only to a top-level Glowtide page, never to a frame inside one, so YouTube's
//   player can't capture the screen.
// - IPC is answered only when it comes from the top frame of a Glowtide page.

import { app, session } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'

const rendererIndex = () => join(__dirname, '../renderer/index.html').toLowerCase()
const devOrigin = () => {
  try {
    return !app.isPackaged && process.env.ELECTRON_RENDERER_URL
      ? new URL(process.env.ELECTRON_RENDERER_URL).origin
      : null
  } catch {
    return null
  }
}

/** True for Glowtide's own renderer page (file:// in a build, the Vite server in development). */
export function isAppUrl(url) {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') return fileURLToPath(u).toLowerCase() === rendererIndex()
    return u.origin === devOrigin()
  } catch {
    return false
  }
}

/** True when an IPC message comes from the top frame of a Glowtide page. */
export function trustedSender(e) {
  const f = e.senderFrame
  return !!f && !f.parent && isAppUrl(f.url)
}

/** An address that may be handed to the browser: https only. */
export function isSafeExternal(url) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

// Asked for by Glowtide itself (capture for the beat, full screen) or YouTube's player
// (full screen, protected media, autoplay); everything else is refused.
const ALLOWED = new Set(['fullscreen', 'media', 'display-capture', 'mediaKeySystem'])
const CAPTURE = new Set(['media', 'display-capture'])
const permitted = (perm, url) => ALLOWED.has(perm) && (!CAPTURE.has(perm) || isAppUrl(url))

export function hardenSession(ses = session.defaultSession, getCaptureSource) {
  ses.setPermissionRequestHandler((_wc, perm, cb, details) =>
    cb(permitted(perm, details?.requestingUrl))
  )
  ses.setPermissionCheckHandler((_wc, perm, origin, details) =>
    permitted(perm, details?.requestingUrl || origin)
  )
  // System audio for the beat: the screen source is only the carrier for loopback audio.
  ses.setDisplayMediaRequestHandler((req, cb) => {
    const f = req.frame
    if (!f || f.parent || !isAppUrl(f.url)) return cb({})
    getCaptureSource()
      .then((video) => (video ? cb({ video, audio: 'loopback' }) : cb({})))
      .catch(() => cb({}))
  })
}

export function hardenContents() {
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-navigate', (e, url) => {
      if (!isAppUrl(url)) e.preventDefault()
    })
    wc.on('will-attach-webview', (e) => e.preventDefault())
    // Refused by default; the player replaces this with one that opens https links outside.
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
}

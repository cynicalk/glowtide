// Phone remote: a small web page on your home network, so a phone can see what's playing,
// read the lyrics and control the music.
//
// Security, as this is the one part of Glowtide that listens on the network:
// - Off unless you turn it on. Only phones you pair get in: pairing needs a six-digit code
//   shown in Glowtide for three minutes after you ask for one, single use, and dropped after
//   five wrong tries. A paired phone gets its own random key, which it never sends again:
//   every request after pairing carries a signature (HMAC-SHA-256 over the method, path, time
//   and body), good for 90 seconds and only once. So someone reading the Wi-Fi traffic sees
//   signatures they can't reuse, not the key. The keys are kept encrypted with Windows' own
//   protection (DPAPI). "Forget all phones" revokes them all.
// - Only devices on a private network (home Wi-Fi, a hotspot) may connect.
// - Requests must name the PC by its IP address (or localhost) in the Host header, so a web
//   page can't reach the remote through a domain it rebinds to your network; a request from
//   another site's page (Origin) is refused.
// - Bodies are capped, values are checked before they reach the controls, only the actions
//   the remote page uses are accepted, and the page itself runs under a strict CSP.
// - Plain HTTP, as on any home network device. The key crosses the network once, as a phone
//   pairs: pair on a network you trust (the Settings say so).

import { createServer } from 'http'
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { networkInterfaces } from 'os'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { REMOTE_HTML, REMOTE_JS, REMOTE_CSS } from './remotePage.js'

export const REMOTE_PORT = 43823 // 43821 is the sign-in redirect, 43822 the YouTube player
const CODE_MS = 3 * 60000
const MAX_TRIES = 5
const MAX_PHONES = 10
const MAX_BODY = 4096
const COVER_HOSTS =
  /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com|ytimg\.com|ggpht\.com|googleusercontent\.com)\//i
const HOST_OK = /^(localhost|(\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\])(:\d{1,5})?$/i
const SIGN_WINDOW_MS = 90000 // a signature is good this long either side of the PC's clock

/** Whether a connection comes from this PC or a private network (not the internet). */
export function privateAddress(addr) {
  const a = String(addr || '')
    .toLowerCase()
    .replace(/^::ffff:/, '')
  if (a === '127.0.0.1' || a === '::1') return true
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(a)) return true
  return /^(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(a) // IPv6 unique-local and link-local
}

/** The signature a request should carry (the page computes the same, see remoteCrypto.js). */
export function signature(key, method, path, ts, body) {
  // the key's 32 bytes (it travels as base64url text), as the phone uses them
  return createHmac('sha256', Buffer.from(key, 'base64url'))
    .update(`${method}\n${path}\n${ts}\n${body}`)
    .digest('base64url')
}

/**
 * Follows a cover's redirects only while they stay on the allowed picture hosts (at most
 * three), so an address on those hosts can't send the fetch anywhere else.
 */
export async function fetchAllowed(url, allowed, { timeout = 8000, fetcher = fetch } = {}) {
  let at = url
  for (let hop = 0; hop < 4; hop++) {
    if (!allowed.test(at)) return null
    const r = await fetcher(at, { redirect: 'manual', signal: AbortSignal.timeout(timeout) })
    if (r.status >= 300 && r.status < 400) {
      const next = r.headers.get('location')
      if (!next) return null
      at = new URL(next, at).href
      continue
    }
    return r
  }
  return null
}

/** The PC's addresses on a home network (private IPv4), for the phone to open. */
export function lanAddresses() {
  const out = []
  for (const list of Object.values(networkInterfaces()))
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address)
    }
  return out
}

/** The value a control takes from the phone, checked; undefined when it isn't valid. */
export function checkControl(action, arg) {
  switch (action) {
    case 'play':
    case 'pause':
    case 'next':
    case 'previous':
      return { action }
    case 'seek':
      return Number.isFinite(arg) && arg >= 0 && arg < 24 * 3600000
        ? { action, arg: Math.round(arg) }
        : undefined
    case 'volume':
      return Number.isFinite(arg) && arg >= 0 && arg <= 100
        ? { action, arg: Math.round(arg) }
        : undefined
    case 'like':
    case 'shuffle':
      return typeof arg === 'boolean' ? { action, arg } : undefined
    case 'repeat':
      return ['off', 'context', 'track'].includes(arg) ? { action, arg } : undefined
    default:
      return undefined
  }
}

/**
 * getState(): Glowtide's state; getLyrics(): the current song's lines; control(action, arg);
 * onChange(): something the Settings show changed (a phone paired, the server stopped).
 */
export function createRemote({
  dir,
  getState,
  getLyrics,
  control,
  onChange = () => {},
  // how the phones' keys are kept on disk: Windows' DPAPI in the app (index.js passes it)
  protect = (s) => s,
  unprotect = (s) => s
}) {
  const phonesFile = join(dir, 'remote-phones.json')
  // [{ id, key (base64url, in memory only), name, added }]; on disk the key is protected.
  // Phones paired before signatures (1.0.20 and 1.0.21) kept a token hash: they pair again.
  let phones = []
  try {
    const saved = JSON.parse(readFileSync(phonesFile, 'utf8'))
    if (Array.isArray(saved?.phones))
      for (const p of saved.phones) {
        if (typeof p?.id !== 'string' || !/^[0-9a-f]{32}$/.test(p.id)) continue
        try {
          const key = unprotect(p.key)
          if (/^[\w-]{43}$/.test(key)) phones.push({ id: p.id, key, name: p.name, added: p.added })
        } catch {
          /* can't be read on this PC or account: that phone pairs again */
        }
      }
  } catch {
    /* none yet */
  }
  const savePhones = () => {
    try {
      writeFileSync(
        phonesFile,
        JSON.stringify({
          v: 2,
          phones: phones.map((p) => ({
            id: p.id,
            key: protect(p.key),
            name: p.name,
            added: p.added
          }))
        })
      )
    } catch {
      /* best effort */
    }
  }
  const seen = new Map() // signatures used, until they expire: each works once
  let server = null
  let error = null
  let pairing = null // { code, until, tries }
  let cover = { id: null, type: null, data: null }

  /** The phone a request is signed by, or null: "<phone id>.<time ms>.<signature>". */
  const signedBy = (req, path, raw) => {
    const h = req.headers['x-glowtide-auth']
    const m = typeof h === 'string' && h.match(/^([0-9a-f]{32})\.(\d{1,15})\.([\w-]{43})$/)
    if (!m) return null
    const [, id, tsText, sig] = m
    const ts = Number(tsText)
    const now = Date.now()
    if (Math.abs(now - ts) > SIGN_WINDOW_MS) return null
    const phone = phones.find((p) => p.id === id)
    if (!phone) return null
    const want = Buffer.from(signature(phone.key, req.method, path, tsText, raw))
    const got = Buffer.from(sig)
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null
    if (seen.has(sig)) return null // replayed
    if (seen.size > 5000) for (const [k, until] of seen) if (until < now) seen.delete(k)
    seen.set(sig, now + 2 * SIGN_WINDOW_MS)
    return phone
  }

  const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Glowtide-Time': String(Date.now()), // the phone keeps its signatures on the PC's clock
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      ...extra
    })
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body)
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      let size = 0
      const chunks = []
      // past the cap nothing more is kept (the rest is read and dropped, so the phone still
      // gets an answer; the server's request timeout ends a body that never finishes)
      req.on('data', (c) => {
        size += c.length
        if (size <= MAX_BODY) chunks.push(c)
      })
      req.on('end', () => {
        if (size > MAX_BODY) return resolve({ raw: null, json: null })
        const raw = Buffer.concat(chunks).toString('utf8')
        try {
          resolve({ raw, json: JSON.parse(raw || '{}') })
        } catch {
          resolve({ raw, json: null })
        }
      })
      req.on('error', () => resolve({ raw: null, json: null }))
    })

  /** What the phone shows: the song, where it is, what can be done. */
  function snapshot() {
    const st = getState()
    const t = st.track
    const p = st.playback
    const pos = p ? (p.isPlaying ? p.progressMs + (Date.now() - p.at) : p.progressMs) : 0
    const yt = st.source === 'youtube'
    const sys = st.source === 'system'
    const c = st.caps || {}
    return {
      track: t
        ? {
            id: String(t.id),
            title: t.name || '',
            artist: String(t.artist || t.artists || ''),
            album: t.album || '',
            durationMs: t.durationMs || 0
          }
        : null,
      playing: !!p?.isPlaying,
      positionMs: Math.max(0, Math.round(pos)),
      offsetMs: st.lyricsOffsetMs || 0,
      volume: Number.isFinite(p?.volume) ? p.volume : null,
      liked: st.liked ?? null,
      accent: st.palette?.[0] || null,
      app: sys ? st.systemApp?.label || null : null,
      can: {
        seek: sys ? !!c.seek || !!st.spotifyBridge : true,
        next: sys ? !!c.next : true,
        previous: sys ? !!c.previous : true,
        volume: !sys && (yt || Number.isFinite(p?.volume)),
        like: st.source === 'spotify' || (sys && !!st.spotifyBridge)
      },
      lyrics: st.lyricsStatus === 'synced' ? 'synced' : 'none'
    }
  }

  async function coverBytes() {
    const t = getState().track
    if (!t) return null
    if (cover.id === t.id) return cover
    const url = t.cover || t.thumb
    let next = { id: t.id, type: null, data: null }
    if (typeof url === 'string') {
      const m = url.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/)
      if (m && url.length < 20e6) next = { id: t.id, type: m[1], data: Buffer.from(m[2], 'base64') }
      else if (COVER_HOSTS.test(url)) {
        try {
          const r = await fetchAllowed(url, COVER_HOSTS)
          const type = r?.headers.get('content-type') || ''
          if (r?.ok && /^image\/(png|jpe?g|webp)$/.test(type)) {
            const buf = Buffer.from(await r.arrayBuffer())
            if (buf.length < 8e6) next = { id: t.id, type, data: buf }
          }
        } catch {
          /* no cover */
        }
      }
    }
    if (getState().track?.id === t.id) cover = next
    return next
  }

  async function handle(req, res) {
    if (!privateAddress(req.socket.remoteAddress))
      return send(res, 403, { error: 'Only devices on your home network.' })
    const host = String(req.headers.host || '')
    if (!HOST_OK.test(host))
      return send(res, 421, { error: 'Open the remote by the PC’s address.' })
    const origin = req.headers.origin
    if (origin && origin !== `http://${host}`) return send(res, 403, { error: 'Not from here.' })
    const url = new URL(req.url, `http://${host}`)
    const path = url.pathname

    if (req.method === 'GET' && (path === '/' || path === '/index.html'))
      return send(res, 200, REMOTE_HTML, 'text/html; charset=utf-8', {
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      })
    if (req.method === 'GET' && path === '/app.js')
      return send(res, 200, REMOTE_JS, 'text/javascript; charset=utf-8')
    if (req.method === 'GET' && path === '/app.css')
      return send(res, 200, REMOTE_CSS, 'text/css; charset=utf-8')

    if (req.method === 'POST' && path === '/api/pair') {
      const { json: body } = await readBody(req)
      const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''
      if (!pairing || Date.now() > pairing.until)
        return send(res, 403, { error: 'Ask Glowtide for a new code: Settings → Phone remote.' })
      const ok = code.length === 6 && timingSafeEqual(Buffer.from(code), Buffer.from(pairing.code))
      if (!ok) {
        if (++pairing.tries >= MAX_TRIES) {
          pairing = null
          onChange()
          return send(res, 403, { error: 'Too many wrong codes. Ask Glowtide for a new one.' })
        }
        return send(res, 403, { error: 'That code isn’t right.' })
      }
      pairing = null
      const id = randomBytes(16).toString('hex')
      const key = randomBytes(32).toString('base64url')
      const name =
        typeof body?.name === 'string' ? body.name.replace(/[^\w ().,-]/g, '').slice(0, 40) : ''
      phones = [...phones, { id, key, name, added: Date.now() }].slice(-MAX_PHONES)
      savePhones()
      onChange()
      return send(res, 200, { id, key, now: Date.now() })
    }

    if (!path.startsWith('/api/')) return send(res, 404, { error: 'Not found.' })
    // signed over the path with its query, and the body as sent
    const signedPath = url.pathname + url.search
    const body = req.method === 'POST' ? await readBody(req) : { raw: '', json: null }
    if (body.raw === null) return send(res, 400, { error: 'Not something the remote can do.' })
    if (!signedBy(req, signedPath, body.raw))
      return send(res, 401, { error: 'Pair this phone again.' })

    if (req.method === 'GET' && path === '/api/state') return send(res, 200, snapshot())
    if (req.method === 'GET' && path === '/api/lyrics') {
      const st = getState()
      const lines =
        st.lyricsStatus === 'synced'
          ? (getLyrics() || [])
              .filter((l) => Number.isFinite(l?.t))
              .map((l) => ({ t: l.t, text: String(l.text || '').slice(0, 300) }))
          : []
      return send(res, 200, { id: st.track ? String(st.track.id) : null, lines })
    }
    if (req.method === 'GET' && path === '/api/cover') {
      const c = await coverBytes()
      if (!c?.data) return send(res, 204, '', 'text/plain')
      return send(res, 200, c.data, c.type)
    }
    if (req.method === 'POST' && path === '/api/control') {
      const ok = body.json && checkControl(body.json.action, body.json.arg)
      if (!ok) return send(res, 400, { error: 'Not something the remote can do.' })
      const r = await control(ok.action, ok.arg)
      return send(res, r?.error ? 409 : 200, r?.error ? { error: r.error } : { ok: true })
    }
    return send(res, 404, { error: 'Not found.' })
  }

  return {
    start(host = '0.0.0.0') {
      if (server) return
      error = null
      server = createServer((req, res) => {
        handle(req, res).catch(() => {
          if (!res.headersSent) send(res, 500, { error: 'Something went wrong.' })
        })
      })
      server.headersTimeout = 10000
      server.requestTimeout = 15000
      server.maxConnections = 32 // a few phones; never an open door for a flood
      server.on('error', (e) => {
        error =
          e.code === 'EADDRINUSE'
            ? `Port ${REMOTE_PORT} is in use by another app.`
            : `The remote couldn’t start (${e.code || e.message}).`
        server = null
        onChange()
      })
      server.listen(REMOTE_PORT, host, () => onChange())
    },
    stop() {
      pairing = null
      if (!server) return
      server.close()
      server.closeAllConnections?.()
      server = null
      onChange()
    },
    /** A new pairing code, shown in Glowtide for three minutes. */
    pair() {
      pairing = {
        code: String(randomInt(0, 1e6)).padStart(6, '0'),
        until: Date.now() + CODE_MS,
        tries: 0
      }
      onChange()
      return { code: pairing.code, until: pairing.until }
    },
    forget() {
      phones = []
      savePhones()
      onChange()
    },
    status() {
      return {
        running: !!server?.listening,
        error,
        port: REMOTE_PORT,
        addresses: lanAddresses().map((a) => `http://${a}:${REMOTE_PORT}`),
        phones: phones.length,
        pairing:
          pairing && Date.now() < pairing.until
            ? { code: pairing.code, until: pairing.until }
            : null
      }
    }
  }
}

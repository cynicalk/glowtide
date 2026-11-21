// Phone remote: a small web page on your home network, so a phone can see what's playing,
// read the lyrics and control the music.
//
// Security, as this is the one part of Glowtide that listens on the network:
// - Off unless you turn it on. Only phones you pair get in: pairing needs a six-digit code
//   shown in Glowtide for three minutes after you ask for one, single use, and dropped after
//   five wrong tries. A paired phone keeps a random token (only its hash is stored here);
//   "Forget all phones" revokes them all.
// - Requests must name the PC by its IP address (or localhost) in the Host header, so a web
//   page can't reach the remote through a domain it rebinds to your network; a request from
//   another site's page (Origin) is refused.
// - Bodies are capped, values are checked before they reach the controls, only the actions
//   the remote page uses are accepted, and the page itself runs under a strict CSP.
// - Plain HTTP, as on any home network device: anyone on the same Wi-Fi who can read its
//   traffic could read the token. Use it on networks you trust (the Settings say so).

import { createServer } from 'http'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
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

const sha = (s) => createHash('sha256').update(s).digest()

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
export function createRemote({ dir, getState, getLyrics, control, onChange = () => {} }) {
  const phonesFile = join(dir, 'remote-phones.json')
  let phones = []
  try {
    const saved = JSON.parse(readFileSync(phonesFile, 'utf8'))
    if (Array.isArray(saved))
      phones = saved.filter((p) => typeof p?.hash === 'string' && /^[0-9a-f]{64}$/.test(p.hash))
  } catch {
    /* none yet */
  }
  const savePhones = () => {
    try {
      writeFileSync(phonesFile, JSON.stringify(phones))
    } catch {
      /* best effort */
    }
  }
  let server = null
  let error = null
  let pairing = null // { code, until, tries }
  let cover = { id: null, type: null, data: null }

  const tokenOk = (req) => {
    const t = req.headers['x-glowtide-token']
    if (typeof t !== 'string' || t.length < 20 || t.length > 100) return null
    const h = sha(t)
    for (const p of phones) {
      const ph = Buffer.from(p.hash, 'hex')
      if (ph.length === h.length && timingSafeEqual(ph, h)) return p
    }
    return null
  }

  const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
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
        if (size > MAX_BODY) return resolve(null)
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          resolve(null)
        }
      })
      req.on('error', () => resolve(null))
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
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
          const type = r.headers.get('content-type') || ''
          if (r.ok && /^image\/(png|jpe?g|webp)$/.test(type)) {
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
      const body = await readBody(req)
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
      const token = randomBytes(32).toString('base64url')
      const name =
        typeof body?.name === 'string' ? body.name.replace(/[^\w ().,-]/g, '').slice(0, 40) : ''
      phones = [...phones, { hash: sha(token).toString('hex'), name, added: Date.now() }].slice(
        -MAX_PHONES
      )
      savePhones()
      onChange()
      return send(res, 200, { token })
    }

    if (!path.startsWith('/api/')) return send(res, 404, { error: 'Not found.' })
    if (!tokenOk(req)) return send(res, 401, { error: 'Pair this phone again.' })

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
      const body = await readBody(req)
      const ok = body && checkControl(body.action, body.arg)
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

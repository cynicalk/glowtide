// Sharing a song you timed to LRCLIB (lrclib.net), the free lyrics database Glowtide reads
// from: ask for a challenge, do the small proof of work it asks for (on a worker thread, so
// the app never stalls), then publish. Only ever on your say-so (the Share button, then
// Publish), and only lyrics you timed yourself.

import { app } from 'electron'
import { Worker } from 'worker_threads'
import { parseLrc } from '../shared/lyrics.mjs'
import { publishBody } from '../shared/lrclib.mjs'

const API = 'https://lrclib.net/api'
const userAgent = () => `Glowtide/${app.getVersion()} (https://github.com/cynicalk/glowtide)`

// The proof of work, in a worker: count up from 0 until SHA-256(prefix + nonce) is at or
// below the target, comparing bytes from the first (as LRCLIB's own client does).
const SOLVER = `
const { parentPort, workerData } = require('worker_threads')
const { createHash } = require('crypto')
const { prefix, target } = workerData
const t = Buffer.from(target, 'hex')
const meets = (h) => {
  for (let i = 0; i < h.length; i++) {
    if (h[i] > t[i]) return false
    if (h[i] < t[i]) return true
  }
  return true
}
let n = 0
while (!meets(createHash('sha256').update(prefix + n).digest())) n++
parentPort.postMessage(String(n))
`

function solve(prefix, target, ms = 180000) {
  return new Promise((resolve, reject) => {
    const w = new Worker(SOLVER, { eval: true, workerData: { prefix, target } })
    const timer = setTimeout(() => {
      w.terminate()
      reject(new Error('the check took too long'))
    }, ms)
    w.once('message', (n) => {
      clearTimeout(timer)
      w.terminate()
      resolve(n)
    })
    w.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

/** What would be published for this song (and your LRC), or why it can't be. */
export function sharePreview(track, lrc) {
  if (!lrc) return { error: 'Time the lyrics first.' }
  const body = publishBody(track, parseLrc(lrc))
  if (body) return { body: { ...body, lines: body.syncedLyrics.split('\n').length } }
  if (!String(track?.album || '').trim())
    return {
      error:
        'LRCLIB needs the album name, and this player doesn’t say it. Sharing works when the song comes from Spotify or a player that names the album.'
    }
  return { error: 'This song is missing its title, artist or length.' }
}

/** Publishes your timing to LRCLIB. { ok } or { error }. */
export async function shareToLrclib(track, lrc) {
  const pre = sharePreview(track, lrc)
  if (pre.error) return pre
  const { lines: _lines, ...body } = pre.body // eslint-disable-line no-unused-vars
  try {
    const ch = await fetch(`${API}/request-challenge`, {
      method: 'POST',
      headers: { 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(15000)
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`LRCLIB ${r.status}`))))
    if (
      typeof ch?.prefix !== 'string' ||
      ch.prefix.length > 256 ||
      !/^[0-9a-f]{64}$/i.test(ch.target || '')
    )
      return { error: 'LRCLIB sent an unexpected reply. Try again later.' }
    const nonce = await solve(ch.prefix, ch.target)
    const res = await fetch(`${API}/publish`, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent(),
        'Content-Type': 'application/json',
        'X-Publish-Token': `${ch.prefix}:${nonce}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    })
    if (res.status === 201 || res.ok) return { ok: true }
    const err = await res.json().catch(() => null)
    if (res.status === 429) return { error: 'LRCLIB is busy. Try again in a minute.' }
    return { error: `LRCLIB didn’t take it: ${err?.message || `error ${res.status}`}` }
  } catch (e) {
    return { error: `Couldn’t reach LRCLIB (${e.message}).` }
  }
}

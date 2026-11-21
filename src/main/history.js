// Your listening history, kept only on this PC (history.jsonl in the settings folder): one
// line per play, for the Stats page. A song counts once you've listened for long enough
// (see countsAsPlay); the demo's songs never count. Off in Settings, nothing is recorded.

import { appendFileSync, readFileSync, writeFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { countsAsPlay, songKeyOf } from '../shared/stats.mjs'

const MAX_LINES = 60000 // years of listening; older plays are dropped beyond it
const MAX_COVERS = 400
const TICK_MS = 3000

/** A small picture to show for a song: an https address, or a small inline image. */
function coverOf(track) {
  for (const c of [track.thumb, track.coverSoft, track.cover]) {
    if (typeof c !== 'string') continue
    if (/^https:\/\//.test(c) && c.length < 1000) return c
    if (/^data:image\/(png|jpe?g|webp);base64,/.test(c) && c.length < 80000) return c
  }
  return null
}

/** dir: the settings folder. Call tick() as the state changes (it also ticks by itself). */
export function createHistory({ dir, getState, enabled, timer = true }) {
  const file = () => join(dir, 'history.jsonl')
  const coversFile = () => join(dir, 'history-covers.json')
  let cur = null // the play under way: { id, key, title, artist, album, source, durationMs, at, ms, last }
  let covers = null

  function loadCovers() {
    if (covers) return covers
    try {
      covers = JSON.parse(readFileSync(coversFile(), 'utf8'))
    } catch {
      covers = {}
    }
    return covers
  }
  function rememberCover(key, track) {
    const c = coverOf(track)
    const all = loadCovers()
    if (!c || all[key] === c) return
    delete all[key] // re-inserted last: the most recent stay
    all[key] = c
    const keys = Object.keys(all)
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_COVERS))) delete all[k]
    try {
      writeFileSync(coversFile(), JSON.stringify(all))
    } catch {
      /* a cover is a nicety */
    }
  }

  function finish() {
    const p = cur
    cur = null
    if (!p || !countsAsPlay(p.ms, p.durationMs)) return
    const rec = {
      at: p.at,
      ms: Math.round(p.ms),
      title: p.title,
      artist: p.artist,
      album: p.album,
      source: p.source
    }
    try {
      appendFileSync(file(), `${JSON.stringify(rec)}\n`)
    } catch {
      /* the next play tries again */
    }
  }

  function tick() {
    const st = getState()
    const tr = st.track
    const now = Date.now()
    if (cur && (!tr || tr.id !== cur.id)) finish()
    const playing =
      !!tr && !!st.playback?.isPlaying && st.source && st.source !== 'demo' && enabled()
    if (!playing) {
      if (cur) cur.last = null // paused: the time doesn't count, the play goes on
      return
    }
    const title = tr.name || tr.title || ''
    const artist = String(tr.artist || tr.artists || '')
    const key = songKeyOf(title, artist)
    if (!key) return
    if (!cur) {
      cur = {
        id: tr.id,
        key,
        title,
        artist,
        album: tr.album || '',
        source: st.source,
        durationMs: tr.durationMs || 0,
        at: now,
        ms: 0,
        last: null
      }
      rememberCover(key, tr)
    }
    // wall time while playing, capped so a sleep or a stalled tick isn't counted
    if (cur.last) cur.ms += Math.min(now - cur.last, TICK_MS * 2)
    cur.last = now
  }

  if (timer) setInterval(tick, TICK_MS).unref?.()

  // Keep the file to MAX_LINES, once at start.
  try {
    if (statSync(file()).size > 4e6) {
      const lines = readFileSync(file(), 'utf8').split('\n').filter(Boolean)
      if (lines.length > MAX_LINES) writeFileSync(file(), `${lines.slice(-MAX_LINES).join('\n')}\n`)
    }
  } catch {
    /* no history yet */
  }

  function saved() {
    try {
      return readFileSync(file(), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return null
          }
        })
        .filter(Boolean)
    } catch {
      return [] // nothing yet
    }
  }

  return {
    tick,
    /** On quit: the song playing counts if it has been listened to long enough. */
    flush: finish,
    /** The plays written so far (not the one under way). */
    saved,
    /** Every play, the one under way included once it counts. */
    plays() {
      const out = saved()
      if (cur && countsAsPlay(cur.ms, cur.durationMs))
        out.push({ at: cur.at, ms: cur.ms, title: cur.title, artist: cur.artist })
      return out
    },
    /** Replaces the written plays (a backup brought in, merged with these). */
    replace(list) {
      const text = list.map((p) => JSON.stringify(p)).join('\n')
      writeFileSync(file(), text ? `${text}\n` : '')
    },
    coverFor: (key) => loadCovers()[key] || null,
    clear() {
      cur = null
      covers = {}
      for (const f of [file(), coversFile()]) rmSync(f, { force: true })
    }
  }
}

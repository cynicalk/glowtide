// Lyrics, best source first:
//   0. Timed by you (tap-to-sync, myLyrics.js)                  timing 'line'
//   1. AMLL TTML DB: word timing done by hand (CC0)            timing 'word'
//   2. LRCLIB enhanced LRC: per-word tags in the file           timing 'word'
//   3. LRCLIB line-synced LRC: words spread across each line    timing 'line' (estimated)
// "timing" travels with the lyrics so the UI never presents an estimate as measured.

import {
  parseLrc,
  estimateWordTiming,
  hasWordTags,
  enhancedLrcLines,
  plainLines
} from '../shared/lyrics.mjs'
import { amllLyrics } from './amll'
import { myLrc } from './myLyrics'
import { chosenId } from './lyricChoice'

const UA = 'Glowtide for Windows/0.1.0'
const cache = new Map()

function cleanTitle(name) {
  return name
    .replace(
      /\s*[-–]\s*(\d{4}\s*)?(remaster(ed)?|live|mono|stereo|radio edit|single version|edit).*$/i,
      ''
    )
    .replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .trim()
}

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12000)
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`)
  return res.json()
}

async function fromLrclib(track, toleranceS) {
  const durS = Math.round(track.durationMs / 1000)
  let hit = null
  // The exact lookup needs an album; YouTube videos have none, so they go straight to search.
  if (track.album) {
    const q = new URLSearchParams({
      track_name: track.name,
      artist_name: track.artist,
      album_name: track.album,
      duration: String(durS)
    })
    hit = await get(`https://lrclib.net/api/get?${q}`)
  }
  if (!hit?.syncedLyrics) {
    const s = new URLSearchParams({ track_name: cleanTitle(track.name), artist_name: track.artist })
    const list = (await get(`https://lrclib.net/api/search?${s}`)) || []
    // Some players don't report a duration: then keep LRCLIB's own ranking.
    const near = durS
      ? list
          .filter((x) => x.syncedLyrics && Math.abs((x.duration || 0) - durS) <= toleranceS)
          .sort((a, b) => Math.abs(a.duration - durS) - Math.abs(b.duration - durS))
      : list.filter((x) => x.syncedLyrics)
    hit = near[0] || hit || list.find((x) => x.instrumental || x.plainLyrics) || null
  }
  return fromRecord(hit, track)
}

/** An LRCLIB record as Glowtide's lyrics (source names where they came from). */
function fromRecord(hit, track, source = 'LRCLIB') {
  if (!hit) return { status: 'none', lines: [] }
  if (hit.instrumental) return { status: 'instrumental', lines: [], source }
  // the text, untimed: the player shows it to read along; nothing times it
  if (!hit.syncedLyrics) return { status: 'plain', lines: plainLines(hit.plainLyrics), source }
  if (hasWordTags(hit.syncedLyrics)) {
    const lines = enhancedLrcLines(hit.syncedLyrics, track.durationMs)
    if (lines.length) return { status: 'synced', timing: 'word', source, lines }
  }
  const lines = estimateWordTiming(parseLrc(hit.syncedLyrics), track.durationMs)
  return lines.length
    ? { status: 'synced', timing: 'line', source, lines }
    : { status: 'none', lines: [] }
}

/**
 * Versions of a song's lyrics on LRCLIB, to pick from: the song's own title and artist, or
 * what you typed. Timed ones first, then the closest in length.
 * [{ id, title, artist, album, durationS, synced, plain, instrumental }]
 */
export async function lyricsCandidates(track, typed) {
  const q = String(typed || '')
    .trim()
    .slice(0, 200)
  const params = q
    ? new URLSearchParams({ q })
    : new URLSearchParams({
        track_name: cleanTitle(track?.name || ''),
        artist_name: track?.artist || ''
      })
  const list = (await get(`https://lrclib.net/api/search?${params}`)) || []
  const durS = Math.round((track?.durationMs || 0) / 1000)
  // how far a version's length is from the song's; no length, or a few seconds (stray
  // fragments), ranks last
  const off = (x) => (x.durationS >= 15 ? Math.abs(x.durationS - durS) : 1e6)
  return list
    .filter((x) => Number.isInteger(x?.id))
    .map((x) => ({
      id: x.id,
      title: String(x.trackName || x.name || ''),
      artist: String(x.artistName || ''),
      album: String(x.albumName || ''),
      durationS: Math.round(x.duration || 0),
      synced: !!x.syncedLyrics,
      plain: !!x.plainLyrics,
      instrumental: !!x.instrumental
    }))
    .sort((a, b) => Number(b.synced) - Number(a.synced) || (durS ? off(a) - off(b) : 0))
    .slice(0, 25)
}

const picked = new Map() // LRCLIB id -> record, so a pick isn't fetched again

/** The version you picked for this song, or null (none picked, or LRCLIB unreachable). */
async function chosenLyrics(track) {
  const id = chosenId(track)
  if (!id) return null
  try {
    if (!picked.has(id)) picked.set(id, await get(`https://lrclib.net/api/get/${id}`))
    const r = fromRecord(picked.get(id), track, 'LRCLIB · your pick')
    return { ...r, chosen: id }
  } catch {
    return null
  }
}

/**
 * { status, timing?, source?, lines }
 * status: 'synced' | 'plain' (text but no timing; we do not invent it: lines are { text }) |
 *         'instrumental' | 'none' | 'error'
 */
/** The lyrics you timed for this song, or null. */
export function myLyrics(track) {
  const lrc = myLrc(track)
  if (!lrc) return null
  // timed word by word (enhanced LRC): measured word timing, the karaoke fill included
  if (hasWordTags(lrc)) {
    const lines = enhancedLrcLines(lrc, track.durationMs)
    if (lines.length) return { status: 'synced', timing: 'word', source: 'Timed by you', lines }
  }
  const lines = estimateWordTiming(parseLrc(lrc), track.durationMs)
  return lines.length ? { status: 'synced', timing: 'line', source: 'Timed by you', lines } : null
}

export async function fetchLyrics(track, { toleranceS = 4, spotifyId } = {}) {
  if (!track?.id) return { status: 'none', lines: [] }
  // yours first, and never cached: a new timing shows at once
  const mine = myLyrics(track)
  if (mine) return mine
  // then the version you picked, if you picked one
  const pick = await chosenLyrics(track)
  if (pick) return pick
  if (cache.has(track.id)) return cache.get(track.id)
  let result = null
  try {
    const a = await amllLyrics(track, { spotifyId, toleranceS })
    if (a) result = { status: 'synced', timing: 'word', source: 'AMLL TTML DB', lines: a.lines }
  } catch {
    /* AMLL unreachable: fall through to LRCLIB */
  }
  if (!result) {
    try {
      result = await fromLrclib(track, toleranceS)
    } catch (e) {
      return { status: 'error', lines: [], message: e.message } // not cached: retry next time
    }
  }
  cache.set(track.id, result)
  return result
}

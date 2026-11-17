// Lyrics, best source first:
//   1. AMLL TTML DB: word timing done by hand (CC0)            timing 'word'
//   2. LRCLIB enhanced LRC: per-word tags in the file           timing 'word'
//   3. LRCLIB line-synced LRC: words spread across each line    timing 'line' (estimated)
// "timing" travels with the lyrics so the UI never presents an estimate as measured.

import { parseLrc, estimateWordTiming, hasWordTags, enhancedLrcLines } from '../shared/lyrics.mjs'
import { amllLyrics } from './amll'

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
  if (!hit) return { status: 'none', lines: [] }
  if (hit.instrumental) return { status: 'instrumental', lines: [] }
  if (!hit.syncedLyrics) return { status: 'plain', lines: [] }
  if (hasWordTags(hit.syncedLyrics)) {
    const lines = enhancedLrcLines(hit.syncedLyrics, track.durationMs)
    if (lines.length) return { status: 'synced', timing: 'word', source: 'LRCLIB', lines }
  }
  const lines = estimateWordTiming(parseLrc(hit.syncedLyrics), track.durationMs)
  return lines.length
    ? { status: 'synced', timing: 'line', source: 'LRCLIB', lines }
    : { status: 'none', lines: [] }
}

/**
 * { status, timing?, source?, lines }
 * status: 'synced' | 'plain' (text but no timing; we do not invent it) |
 *         'instrumental' | 'none' | 'error'
 */
export async function fetchLyrics(track, { toleranceS = 4, spotifyId } = {}) {
  if (!track?.id) return { status: 'none', lines: [] }
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

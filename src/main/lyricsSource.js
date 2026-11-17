// Synced lyrics from LRCLIB (lrclib.net): free, no key, line-level timing.

import { parseLrc, estimateWordTiming } from '../shared/lyrics.mjs'

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
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`)
  return res.json()
}

/**
 * { status, lines }
 * status: 'synced' | 'plain' (text but no timing; we do not invent it) |
 *         'instrumental' | 'none' | 'error'
 */
export async function fetchLyrics(track, { toleranceS = 4 } = {}) {
  if (!track?.id) return { status: 'none', lines: [] }
  if (cache.has(track.id)) return cache.get(track.id)
  let result
  try {
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
      const s = new URLSearchParams({
        track_name: cleanTitle(track.name),
        artist_name: track.artist
      })
      const list = (await get(`https://lrclib.net/api/search?${s}`)) || []
      const near = list
        .filter((x) => x.syncedLyrics && Math.abs((x.duration || 0) - durS) <= toleranceS)
        .sort((a, b) => Math.abs(a.duration - durS) - Math.abs(b.duration - durS))
      hit = near[0] || hit || list.find((x) => x.instrumental || x.plainLyrics) || null
    }
    if (!hit) result = { status: 'none', lines: [] }
    else if (hit.instrumental) result = { status: 'instrumental', lines: [] }
    else if (hit.syncedLyrics) {
      const lines = estimateWordTiming(parseLrc(hit.syncedLyrics), track.durationMs)
      result = lines.length ? { status: 'synced', lines } : { status: 'none', lines: [] }
    } else result = { status: 'plain', lines: [] }
  } catch (e) {
    return { status: 'error', lines: [], message: e.message } // not cached: retry next time
  }
  cache.set(track.id, result)
  return result
}

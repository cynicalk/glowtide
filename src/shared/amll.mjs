// Matching a playing song to the AMLL TTML DB (github.com/amll-dev/amll-ttml-db, CC0):
// community word-timed lyrics. Its metadata/raw-lyrics-index.jsonl lists every file with
// title, artists, album and platform ids. Pure, no I/O.

import { cleanSongTitle } from './youtube.mjs'

const fold = (s) =>
  (s || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '')

/** A title reduced to what identifies the song: no packaging, feat., punctuation or case. */
export function normTitle(t) {
  const cleaned = cleanSongTitle(
    (t || '').replace(
      /\s+-\s+(\d{4}\s+)?(remaster(ed)?|single version|radio edit|mono|stereo)\b.*$/i,
      ''
    )
  )
  return fold(cleaned)
}

export function normArtist(a) {
  return fold(a)
}

/** "A, B & C feat. D" -> ['a', 'b', 'c', 'd'] (normalised). */
export function splitArtists(s) {
  return (
    Array.isArray(s)
      ? s
      : String(s || '').split(/\s*(?:,|;|\/|&| and | x | feat\.?| ft\.?| with )\s*/i)
  )
    .map(normArtist)
    .filter(Boolean)
}

/** Index text (JSON lines) -> lookup maps. Newer submissions win (file names start with a timestamp). */
export function buildAmllIndex(jsonl) {
  const bySpotify = new Map()
  const byTitle = new Map()
  const rows = []
  for (const line of String(jsonl || '').split('\n')) {
    if (!line.trim()) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (!e.rawLyricFile || !Array.isArray(e.metadata)) continue
    const md = Object.fromEntries(e.metadata)
    rows.push({ file: e.rawLyricFile, md })
  }
  rows.sort((a, b) => (a.file < b.file ? 1 : -1)) // newest first
  for (const { file, md } of rows) {
    for (const id of md.spotifyId || []) if (!bySpotify.has(id)) bySpotify.set(id, file)
    const artists = new Set((md.artists || []).flatMap((a) => splitArtists(a)))
    for (const name of md.musicName || []) {
      const key = normTitle(name)
      if (!key) continue
      if (!byTitle.has(key)) byTitle.set(key, [])
      byTitle.get(key).push({ file, artists })
    }
  }
  return { bySpotify, byTitle, size: rows.length }
}

/**
 * { file, by } or null. A Spotify id is an exact match; otherwise the title must match
 * and at least one artist must be shared, so "Stay" by one artist never gets another's.
 */
export function findAmll(index, track, { spotifyId } = {}) {
  if (!index || !track) return null
  if (spotifyId && index.bySpotify.has(spotifyId))
    return { file: index.bySpotify.get(spotifyId), by: 'id' }
  const ours = new Set(splitArtists(track.artists || track.artist))
  if (!ours.size) return null
  const keys = [
    normTitle(track.name),
    normTitle((track.name || '').replace(/\s*[([][^)\]]*[)\]]/g, ''))
  ]
  for (const key of new Set(keys)) {
    for (const c of index.byTitle.get(key) || []) {
      for (const a of ours) if (c.artists.has(a)) return { file: c.file, by: 'title' }
    }
  }
  return null
}

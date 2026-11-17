// AMLL TTML DB client: word-timed lyrics, CC0 (github.com/amll-dev/amll-ttml-db).
// The index (~1.7 MB) is cached on disk and refreshed at most once a day; lyric files
// are fetched on demand and kept in memory.

import { app } from 'electron'
import { readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { buildAmllIndex, findAmll } from '../shared/amll.mjs'
import { parseTtml } from '../shared/ttml.mjs'

const RAW = 'https://raw.githubusercontent.com/amll-dev/amll-ttml-db/main'
const DAY = 24 * 60 * 60 * 1000
const cacheFile = () => join(app.getPath('userData'), 'amll-index.jsonl')

let index = null
let loading = null
const files = new Map()

async function download(url, ms = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`AMLL ${res.status}`)
  return res.text()
}

function readCache() {
  try {
    const age = Date.now() - statSync(cacheFile()).mtimeMs
    return { text: readFileSync(cacheFile(), 'utf8'), fresh: age < DAY }
  } catch {
    return null
  }
}

/** The index, from memory, a fresh disk cache, the network, or a stale cache, in that order. */
export function loadAmllIndex() {
  if (index) return Promise.resolve(index)
  loading ??= (async () => {
    const cached = readCache()
    if (cached?.fresh) return (index = buildAmllIndex(cached.text))
    try {
      const text = await download(`${RAW}/metadata/raw-lyrics-index.jsonl`, 30000)
      try {
        writeFileSync(cacheFile(), text)
      } catch {
        /* cache is optional */
      }
      return (index = buildAmllIndex(text))
    } catch {
      return (index = cached ? buildAmllIndex(cached.text) : null)
    }
  })().finally(() => (loading = null))
  return loading
}

/**
 * Word-timed lines for a track, or null. A title match whose file is clearly a different
 * length than the song (a live or extended version) is rejected.
 */
export async function amllLyrics(track, { spotifyId, toleranceS = 8 } = {}) {
  const idx = await loadAmllIndex()
  const hit = findAmll(idx, track, { spotifyId })
  if (!hit) return null
  let xml = files.get(hit.file)
  if (!xml) {
    xml = await download(`${RAW}/raw-lyrics/${encodeURIComponent(hit.file)}`)
    files.set(hit.file, xml)
    if (files.size > 50) files.delete(files.keys().next().value)
  }
  const parsed = parseTtml(xml)
  if (!parsed.lines.length) return null
  if (
    hit.by === 'title' &&
    parsed.durationMs > 0 &&
    track.durationMs > 0 &&
    Math.abs(parsed.durationMs - track.durationMs) > Math.max(8, toleranceS) * 1000
  )
    return null
  return { lines: parsed.lines, by: hit.by, file: hit.file }
}

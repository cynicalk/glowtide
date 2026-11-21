// Remembers the lyric nudge (early/late) per song, so a mistimed lyric file only has to be
// fixed once. Keyed by artist + title, so it carries across sources (Spotify, any app...).

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { normTitle, splitArtists } from '../shared/amll.mjs'

const MAX = 500
const file = () => join(app.getPath('userData'), 'lyric-offsets.json')
let cache = null

function load() {
  if (cache) return cache
  try {
    cache = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    cache = {}
  }
  return cache
}

export function songKey(track) {
  if (!track) return null
  const artist = splitArtists(track.artists || track.artist)[0] || ''
  const title = normTitle(track.name)
  return title ? `${artist}|${title}` : null
}

export function offsetFor(track) {
  const k = songKey(track)
  return (k && load()[k]) || 0
}

export function saveOffset(track, ms) {
  const k = songKey(track)
  if (!k) return
  const all = load()
  delete all[k] // re-insert so the newest stay when trimming
  if (ms) all[k] = ms
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[old]
  try {
    writeFileSync(file(), JSON.stringify(all))
  } catch {
    /* remembering is a convenience */
  }
}

/** Everything saved, for a backup. */
export function allSaved() {
  return { ...load() }
}

/** Adds a backup's entries (the backup wins for a song in both), then saves. */
export function mergeSaved(entries) {
  const all = { ...load(), ...entries }
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[old]
  cache = all
  try {
    writeFileSync(file(), JSON.stringify(all))
  } catch {
    /* kept until Glowtide closes */
  }
}

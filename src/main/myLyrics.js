// Lyrics you timed yourself (tap-to-sync), kept on this PC as LRC, per song. Keyed by artist
// and title (as the lyric nudge is), so a song timed while following one app is timed in
// every source.

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { songKey } from './offsets'

const MAX = 2000
const file = () => join(app.getPath('userData'), 'my-lyrics.json')
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

function save() {
  try {
    writeFileSync(file(), JSON.stringify(cache))
  } catch {
    /* not saved: it still works until Glowtide closes */
  }
}

/** The LRC you saved for this song, or null. */
export function myLrc(track) {
  const k = songKey(track)
  return (k && load()[k]?.lrc) || null
}

export function saveMyLrc(track, lrc) {
  const k = songKey(track)
  if (!k) return false
  const all = load()
  delete all[k] // re-insert so the newest stay when trimming
  all[k] = { lrc, saved: new Date().toISOString() }
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[old]
  save()
  return true
}

export function removeMyLrc(track) {
  const k = songKey(track)
  if (!k || !load()[k]) return
  delete cache[k]
  save()
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

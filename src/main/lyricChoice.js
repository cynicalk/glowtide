// The lyrics version you picked for a song (Wrong lyrics? → a version from LRCLIB), kept on
// this PC. Keyed by artist and title, so the pick holds in every source.

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { songKey } from './offsets'

const MAX = 2000
const file = () => join(app.getPath('userData'), 'lyric-choices.json')
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

/** The LRCLIB record id you picked for this song, or null. */
export function chosenId(track) {
  const k = songKey(track)
  const id = k && load()[k]
  return Number.isInteger(id) ? id : null
}

/** Pick a version (an LRCLIB id), or null to go back to the automatic choice. */
export function choose(track, id) {
  const k = songKey(track)
  if (!k) return
  const all = load()
  delete all[k]
  if (Number.isInteger(id) && id > 0) all[k] = id
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[old]
  try {
    writeFileSync(file(), JSON.stringify(all))
  } catch {
    /* not saved: it still holds until Glowtide closes */
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

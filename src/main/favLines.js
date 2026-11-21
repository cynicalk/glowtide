// Favourite lines: the lines you starred while they were sung, kept on this PC
// (favourite-lines.json), newest first, for the Stats page and its cards.

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { songKey } from './offsets'

const MAX = 500
const file = () => join(app.getPath('userData'), 'favourite-lines.json')
let cache = null

/** A small picture for the card: an https address, or a small inline image. */
function coverOf(track) {
  for (const c of [track?.cover, track?.coverSoft, track?.thumb]) {
    if (typeof c !== 'string') continue
    if (/^https:\/\//.test(c) && c.length < 1000) return c
    if (/^data:image\/(png|jpe?g|webp);base64,/.test(c) && c.length < 200000) return c
  }
  return null
}

function load() {
  if (cache) return cache
  try {
    const saved = JSON.parse(readFileSync(file(), 'utf8'))
    cache = Array.isArray(saved) ? saved : []
  } catch {
    cache = []
  }
  return cache
}

function save() {
  try {
    writeFileSync(file(), JSON.stringify(cache))
  } catch {
    /* kept until Glowtide closes */
  }
}

const clean = (text) =>
  String(text || '')
    .trim()
    .slice(0, 300)

/** The lines you starred in this song: their texts. */
export function favsFor(track) {
  const k = songKey(track)
  return k
    ? load()
        .filter((f) => f.key === k)
        .map((f) => f.text)
    : []
}

/** Stars a line of the song playing, or unstars it. Returns whether it's starred now. */
export function toggleFav(track, text) {
  const k = songKey(track)
  const t = clean(text)
  if (!k || !t) return false
  const all = load()
  const i = all.findIndex((f) => f.key === k && f.text === t)
  if (i >= 0) {
    all.splice(i, 1)
    save()
    return false
  }
  all.unshift({
    key: k,
    text: t,
    title: String(track.name || '').slice(0, 200),
    artist: String(track.artist || track.artists || '').slice(0, 200),
    cover: coverOf(track),
    at: Date.now()
  })
  cache = all.slice(0, MAX)
  save()
  return true
}

/** Every starred line, newest first. */
export function allFavs() {
  return load().slice()
}

/** Removes one, by song and text (from the Stats page). */
export function removeFav(key, text) {
  const all = load()
  const i = all.findIndex((f) => f.key === key && f.text === text)
  if (i < 0) return
  all.splice(i, 1)
  save()
}

/** A backup's starred lines added to these (no doubles), newest first. */
export function mergeFavs(list) {
  const all = load()
  const seen = new Set(all.map((f) => `${f.key}\n${f.text}`))
  for (const f of list) if (!seen.has(`${f.key}\n${f.text}`)) all.push(f)
  cache = all.sort((a, b) => b.at - a.at).slice(0, MAX)
  save()
}

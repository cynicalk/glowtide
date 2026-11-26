// Your YouTube library in Glowtide, kept on this PC (youtube-library.json): the songs you
// liked (the heart, while YouTube plays), the albums and playlists you saved, and what you
// played lately. No Google sign-in needed: YouTube's own account library stays YouTube's,
// and Glowtide only ever asks to read that.

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { cleanList, cleanSong } from '../shared/innertube.mjs'

const MAX_LIKED = 2000
const MAX_LISTS = 300
const MAX_RECENT = 50
const file = () => join(app.getPath('userData'), 'youtube-library.json')
let cache = null
let rev = 0

const tidy = (list, clean, max) =>
  (Array.isArray(list) ? list : [])
    .map(clean)
    .filter(Boolean)
    .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
    .slice(0, max)

function load() {
  if (cache) return cache
  let saved = null
  try {
    saved = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    /* nothing kept yet */
  }
  cache = {
    liked: tidy(saved?.liked, cleanSong, MAX_LIKED),
    lists: tidy(saved?.lists, cleanList, MAX_LISTS),
    recent: tidy(saved?.recent, cleanSong, MAX_RECENT)
  }
  return cache
}

function save() {
  rev++
  try {
    writeFileSync(file(), JSON.stringify(cache))
  } catch {
    /* kept until Glowtide closes */
  }
}

/** Newest first; at most max; the same one once. */
function putFirst(list, item, max) {
  const out = [item, ...list.filter((x) => x.id !== item.id)]
  return out.slice(0, max)
}

export const ytLibrary = {
  /** Changes whenever the library does: the window reloads its lists on it. */
  rev: () => rev,
  all: () => {
    const l = load()
    return { liked: l.liked, lists: l.lists, recent: l.recent }
  },
  isLiked: (videoId) => !!videoId && load().liked.some((s) => s.videoId === videoId),
  setLiked(song, on) {
    const s = cleanSong(song)
    if (!s) return false
    const l = load()
    l.liked = on ? putFirst(l.liked, s, MAX_LIKED) : l.liked.filter((x) => x.id !== s.id)
    save()
    return true
  },
  isSaved: (playlistId) => load().lists.some((p) => p.id === playlistId),
  setSaved(list, on) {
    const p = cleanList(list)
    if (!p) return false
    const l = load()
    l.lists = on ? putFirst(l.lists, p, MAX_LISTS) : l.lists.filter((x) => x.id !== p.id)
    save()
    return true
  },
  played(song) {
    const s = cleanSong(song)
    if (!s || !s.name) return
    const l = load()
    if (l.recent[0]?.id === s.id) return
    l.recent = putFirst(l.recent, s, MAX_RECENT)
    save()
  },
  /** For a backup: the whole library. */
  dump: () => load(),
  /** From a backup: added to what's here (what's here first). */
  merge(b) {
    if (!b || typeof b !== 'object') return
    const l = load()
    l.liked = tidy([...l.liked, ...(b.liked || [])], cleanSong, MAX_LIKED)
    l.lists = tidy([...l.lists, ...(b.lists || [])], cleanList, MAX_LISTS)
    l.recent = tidy([...l.recent, ...(b.recent || [])], cleanSong, MAX_RECENT)
    save()
  }
}

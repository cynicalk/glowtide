// Your YouTube library in Glowtide, kept on this PC (youtube-library.json): the songs you
// liked (the heart, while YouTube plays), the albums and playlists you saved, the playlists
// you made in Glowtide, and what you played lately. No Google sign-in needed: YouTube's own account library stays YouTube's,
// and Glowtide only ever asks to read that.

import { app } from 'electron'
import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { cleanList, cleanSong } from '../shared/innertube.mjs'

const MAX_LIKED = 2000
const MAX_LISTS = 300
const MAX_RECENT = 50
const MAX_OWN = 100
const MAX_OWN_SONGS = 1000
const OWN_ID = /^gt-[a-z0-9]{6,20}$/

/** A playlist made in Glowtide → its tidy shape, or null. */
function cleanOwn(p) {
  if (!OWN_ID.test(p?.id || '')) return null
  const name = typeof p.name === 'string' ? p.name.trim().slice(0, 100) : ''
  return {
    id: p.id,
    name: name || 'My playlist',
    songs: (Array.isArray(p.songs) ? p.songs : [])
      .map(cleanSong)
      .filter(Boolean)
      .slice(0, MAX_OWN_SONGS),
    made: Number.isFinite(p.made) ? p.made : Date.now()
  }
}
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
    recent: tidy(saved?.recent, cleanSong, MAX_RECENT),
    own: tidy(saved?.own, cleanOwn, MAX_OWN)
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
    return { liked: l.liked, lists: l.lists, recent: l.recent, own: l.own }
  },
  /** One of your own playlists (id 'gt-…'), or null. */
  ownList: (id) => load().own.find((p) => p.id === id) || null,
  /** A new playlist (with a first song, if given): its id, or null. */
  newList(name, song) {
    const l = load()
    if (l.own.length >= MAX_OWN) return null
    if (song && !cleanSong(song)) return null // a song that isn't one: no empty playlist
    const p = cleanOwn({
      id: `gt-${randomBytes(6).toString('hex')}`,
      name,
      songs: song ? [song] : [],
      made: Date.now()
    })
    l.own = [p, ...l.own]
    save()
    return p.id
  },
  addTo(id, song) {
    const p = load().own.find((x) => x.id === id)
    const s = cleanSong(song)
    if (!p || !s || p.songs.length >= MAX_OWN_SONGS) return false
    if (!p.songs.some((x) => x.id === s.id)) p.songs.push(s)
    save()
    return true
  },
  removeFrom(id, index) {
    const p = load().own.find((x) => x.id === id)
    if (!p || !Number.isInteger(index) || index < 0 || index >= p.songs.length) return false
    p.songs.splice(index, 1)
    save()
    return true
  },
  rename(id, name) {
    const p = load().own.find((x) => x.id === id)
    const n = typeof name === 'string' ? name.trim().slice(0, 100) : ''
    if (!p || !n) return false
    p.name = n
    save()
    return true
  },
  deleteList(id) {
    const l = load()
    if (!l.own.some((x) => x.id === id)) return false
    l.own = l.own.filter((x) => x.id !== id)
    save()
    return true
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
    l.own = tidy([...l.own, ...(Array.isArray(b.own) ? b.own : [])], cleanOwn, MAX_OWN)
    save()
  }
}

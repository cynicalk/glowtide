// Listening stats from the local play history: what you played most, for how long, by day.
// A play is one song listened to for long enough (see countsAsPlay). Pure: no I/O, no DOM.

import { normArtist, normTitle, splitArtists } from './amll.mjs'

/** "A, B & C feat. D" -> the names as written, for showing (splitArtists folds them). */
const namesOf = (s) =>
  String(s || '')
    .split(/\s*(?:,|;|\/|&| and | x | feat\.?| ft\.?| with )\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)

const DAY = 86400000

/** One song across sources and spellings: first artist + title, as lyric offsets key it. */
export function songKeyOf(title, artist) {
  const t = normTitle(title || '')
  if (!t) return null
  return `${splitArtists(artist || '')[0] || ''}|${t}`
}

/**
 * Whether a listen counts as a play: 30 seconds, or half of a song shorter than a minute
 * (but at least 10 seconds), as scrobblers count them. Skipping through doesn't count.
 */
export function countsAsPlay(ms, durationMs) {
  if (ms >= 30000) return true
  return durationMs > 0 && durationMs < 60000 && ms >= Math.max(10000, durationMs / 2)
}

export const RANGES = {
  week: { days: 7, label: 'This week', title: 'My week in music', previous: 'last week' },
  month: { days: 30, label: 'This month', title: 'My month in music', previous: 'last month' },
  year: { days: 365, label: 'This year', title: 'My year in music', previous: 'last year' },
  all: { days: null, label: 'All time', title: 'My music', previous: null }
}

const startOfDay = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const startOfMonth = (t) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}
const addMonths = (t, n) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()
}

/** The bars: days for a week or month, months for a year or all time. */
function bucketsFor(range, from, to) {
  const out = []
  if (range === 'week' || range === 'month') {
    for (let t = from; t < to; t = startOfDay(t + DAY + 3600000)) {
      const d = new Date(t)
      out.push({
        start: t,
        end: startOfDay(t + DAY + 3600000), // the hour covers a daylight-saving day
        label:
          range === 'week'
            ? d.toLocaleDateString(undefined, { weekday: 'short' })
            : String(d.getDate()),
        long: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      })
    }
  } else {
    for (let t = startOfMonth(from); t < to; t = addMonths(t, 1)) {
      const d = new Date(t)
      out.push({
        start: t,
        end: addMonths(t, 1),
        label: d.toLocaleDateString(undefined, { month: 'short' }),
        long: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      })
    }
  }
  return out
}

/**
 * The stats for a range ('week' | 'month' | 'year' | 'all') at time now.
 * plays: [{ at, ms, title, artist, album, source }].
 * previous: the listening time of the period just before, or null when the history doesn't
 * reach back that far (so a first week is never "up 100%" on a week that wasn't recorded).
 */
export function summarize(plays, range = 'week', now = Date.now()) {
  const r = RANGES[range] ? range : 'week'
  const { days } = RANGES[r]
  const valid = plays.filter((p) => Number.isFinite(p?.at) && Number.isFinite(p?.ms) && p.title)
  const first = valid.reduce((a, p) => Math.min(a, p.at), Infinity)
  const to = now
  const from = days
    ? startOfDay(now - (days - 1) * DAY)
    : Number.isFinite(first)
      ? startOfMonth(first)
      : startOfMonth(now)
  const inRange = valid.filter((p) => p.at >= from && p.at < to)

  const songs = new Map()
  const artists = new Map()
  for (const p of inRange) {
    const key = songKeyOf(p.title, p.artist)
    if (!key) continue
    const s = songs.get(key) || { key, title: p.title, artist: p.artist || '', plays: 0, ms: 0 }
    s.plays++
    s.ms += p.ms
    songs.set(key, s)
    for (const name of namesOf(p.artist)) {
      const k = normArtist(name)
      if (!k) continue
      const a = artists.get(k) || { artist: name, plays: 0, ms: 0 }
      a.plays++
      a.ms += p.ms
      artists.set(k, a)
    }
  }
  const rank = (a, b) => b.plays - a.plays || b.ms - a.ms
  const buckets = bucketsFor(r, from, to).map((b) => {
    const here = inRange.filter((p) => p.at >= b.start && p.at < b.end)
    return { ...b, plays: here.length, ms: here.reduce((a, p) => a + p.ms, 0) }
  })

  let previous = null
  if (days && first < from) {
    const pFrom = from - days * DAY
    const before = valid.filter((p) => p.at >= pFrom && p.at < from)
    previous = { ms: before.reduce((a, p) => a + p.ms, 0), plays: before.length }
  }

  return {
    range: r,
    from,
    to,
    plays: inRange.length,
    ms: inRange.reduce((a, p) => a + p.ms, 0),
    songs: songs.size,
    artists: artists.size,
    topSongs: [...songs.values()].sort(rank).slice(0, 10),
    topArtists: [...artists.values()].sort(rank).slice(0, 5),
    buckets,
    previous
  }
}

/** "2 h 05 min", "45 min", "under a minute": how long, for people. */
export function formatListening(ms) {
  const min = Math.floor(ms / 60000)
  if (min < 1) return ms > 0 ? 'under a minute' : '0 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${String(min % 60).padStart(2, '0')} min`
}

const isoDay = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Whether the weekly recap is due: from 19:00 on a Sunday until Monday noon, once per week.
 * Returns that Sunday's date ('2026-11-22') when it is due and wasn't shown yet, else null.
 */
export function recapDue(now, lastShown) {
  const d = new Date(now)
  const h = d.getHours()
  let sunday = null
  if (d.getDay() === 0 && h >= 19) sunday = now
  else if (d.getDay() === 1 && h < 12) sunday = now - DAY
  if (sunday === null) return null
  const key = isoDay(sunday)
  return key === lastShown ? null : key
}

/** The recap's words, or null when nothing was played. */
export function recapText(s) {
  if (!s?.plays) return null
  const top = s.topSongs[0]
  return {
    title: `Your week in music: ${formatListening(s.ms)}`,
    body: top
      ? `Top song: ${top.title}${top.artist ? ` by ${top.artist}` : ''} (${top.plays} ${top.plays === 1 ? 'play' : 'plays'}). Open Stats for your card.`
      : 'Open Stats for your card.'
  }
}

/**
 * "On this day": the song you played most around this date a month ago and a year ago (the
 * week centred on that day), when you played it at least three times. Nothing for a period
 * the history doesn't reach, so it's never a guess.
 */
export function onThisDay(plays, now = Date.now()) {
  const d = new Date(now)
  const ago = [
    ['month', 'This time last month', new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())],
    ['year', 'This time last year', new Date(d.getFullYear() - 1, d.getMonth(), d.getDate())]
  ]
  const out = []
  for (const [when, label, day] of ago) {
    const mid = day.getTime() + DAY / 2
    const from = mid - 3.5 * DAY
    const to = mid + 3.5 * DAY
    const songs = new Map()
    for (const p of plays) {
      if (!Number.isFinite(p?.at) || p.at < from || p.at >= to) continue
      const key = songKeyOf(p.title, p.artist)
      if (!key) continue
      const s = songs.get(key) || { title: p.title, artist: p.artist || '', plays: 0, ms: 0 }
      s.plays++
      s.ms += Number.isFinite(p.ms) ? p.ms : 0
      songs.set(key, s)
    }
    const top = [...songs.values()].sort((a, b) => b.plays - a.plays || b.ms - a.ms)[0]
    if (top && top.plays >= 3)
      out.push({ when, label, ...top, key: songKeyOf(top.title, top.artist) })
  }
  return out
}

/**
 * Your year in music: the year's listening (or since your history began, when that was later
 * in the year). Top songs and artists, your biggest day, your longest run of days in a row,
 * and time listened each month. null when nothing was played that year.
 */
export function yearInMusic(plays, year, now = Date.now()) {
  const from = new Date(year, 0, 1).getTime()
  const to = Math.min(new Date(year + 1, 0, 1).getTime(), now)
  const list = plays.filter(
    (p) => Number.isFinite(p?.at) && Number.isFinite(p?.ms) && p.title && p.at >= from && p.at < to
  )
  if (!list.length) return null
  const s = summarize(list, 'all', to)
  const dayKey = (t) => {
    const d = new Date(t)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const days = new Map()
  const months = Array(12).fill(0)
  for (const p of list) {
    const k = dayKey(p.at)
    const d = days.get(k) || { date: k, ms: 0, plays: 0 }
    d.ms += p.ms
    d.plays++
    days.set(k, d)
    months[new Date(p.at).getMonth()] += p.ms
  }
  const topDay = [...days.values()].sort((a, b) => b.ms - a.ms || b.plays - a.plays)[0]
  // the longest run of days in a row with something played
  const sorted = [...days.keys()].sort()
  let streak = { days: 0, from: null, to: null }
  let run = 0
  let start = null
  let prev = null
  for (const k of sorted) {
    const d = new Date(`${k}T12:00:00`)
    const next = prev && new Date(prev.getTime() + DAY)
    run = next && dayKey(next) === k ? run + 1 : 1
    if (run === 1) start = k
    if (run > streak.days) streak = { days: run, from: start, to: k }
    prev = d
  }
  const first = Math.min(...list.map((p) => p.at))
  return {
    year,
    since: first - from > 14 * DAY ? first : null, // the history began later in the year
    ms: s.ms,
    plays: s.plays,
    songs: s.songs,
    artists: s.artists,
    days: days.size,
    topSongs: s.topSongs.slice(0, 5),
    topArtists: s.topArtists.slice(0, 5),
    topDay,
    streak,
    months
  }
}

/** When the year-in-music notification is due: from 1 December, once a year. */
export function yearDue(now, lastShown) {
  const d = new Date(now)
  if (d.getMonth() !== 11) return null
  const key = String(d.getFullYear())
  return key === lastShown ? null : key
}

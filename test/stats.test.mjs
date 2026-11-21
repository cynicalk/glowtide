import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countsAsPlay, formatListening, songKeyOf, summarize } from '../src/shared/stats.mjs'

const DAY = 86400000
// a fixed "now": a Wednesday at 15:00 local time
const NOW = new Date(2026, 10, 18, 15, 0, 0).getTime()
const play = (daysAgo, title, artist, min = 3) => ({
  at: NOW - daysAgo * DAY - 3600000,
  ms: min * 60000,
  title,
  artist,
  source: 'system'
})

test('a play is 30 seconds, or half of a short song', () => {
  assert.ok(countsAsPlay(30000, 200000))
  assert.ok(!countsAsPlay(29000, 200000), 'skipping through is not a play')
  assert.ok(countsAsPlay(25000, 45000), 'half of a 45-second song')
  assert.ok(!countsAsPlay(8000, 12000), 'never under 10 seconds')
})

test('the same song from different sources and spellings is one song', () => {
  assert.equal(songKeyOf('Song (Remastered 2011)', 'Band, Guest'), songKeyOf('Song', 'Band'))
  assert.equal(songKeyOf('', 'Band'), null)
})

test('week: top songs and artists, by plays then time', () => {
  const plays = [
    play(0, 'A', 'One'),
    play(1, 'A', 'One'),
    play(1, 'B', 'Two, One'),
    play(2, 'C', 'Three', 10),
    play(9, 'Old', 'Gone') // before this week
  ]
  const s = summarize(plays, 'week', NOW)
  assert.equal(s.plays, 4)
  assert.equal(s.ms, 19 * 60000)
  assert.equal(s.songs, 3)
  assert.deepEqual(
    s.topSongs.map((x) => x.title),
    ['A', 'C', 'B']
  )
  assert.equal(s.topArtists[0].artist, 'One', 'a featured artist counts for both')
  assert.equal(s.topArtists[0].plays, 3)
  assert.ok(!s.topSongs.some((x) => x.title === 'Old'))
})

test('the bars add up to the total, one per day of the week', () => {
  const plays = [play(0, 'A', 'One'), play(3, 'B', 'Two'), play(6, 'C', 'Three')]
  const s = summarize(plays, 'week', NOW)
  assert.equal(s.buckets.length, 7)
  assert.equal(
    s.buckets.reduce((a, b) => a + b.ms, 0),
    s.ms
  )
  assert.equal(s.buckets.at(-1).plays, 1, 'today is the last bar')
  const month = summarize(plays, 'month', NOW)
  assert.equal(month.buckets.length, 30)
  const year = summarize(plays, 'year', NOW)
  assert.ok(year.buckets.length >= 12 && year.buckets.length <= 13)
})

test('no comparison with a period the history does not reach', () => {
  const s = summarize([play(1, 'A', 'One')], 'week', NOW)
  assert.equal(s.previous, null)
  const t = summarize([play(1, 'A', 'One'), play(10, 'B', 'Two', 5)], 'week', NOW)
  assert.deepEqual(t.previous, { ms: 5 * 60000, plays: 1 })
})

test('all time starts at the first play', () => {
  const s = summarize([play(70, 'A', 'One'), play(1, 'B', 'Two')], 'all', NOW)
  assert.equal(s.plays, 2)
  assert.ok(s.buckets.length >= 3)
  assert.equal(s.previous, null)
})

test('nothing played: an honest empty result', () => {
  const s = summarize([], 'week', NOW)
  assert.equal(s.plays, 0)
  assert.equal(s.ms, 0)
  assert.deepEqual(s.topSongs, [])
  assert.equal(s.buckets.length, 7)
})

test('listening time reads naturally', () => {
  assert.equal(formatListening(0), '0 min')
  assert.equal(formatListening(20000), 'under a minute')
  assert.equal(formatListening(45 * 60000), '45 min')
  assert.equal(formatListening(125 * 60000), '2 h 05 min')
})

test('the weekly recap is due on Sunday evening or Monday morning, once a week', async () => {
  const { recapDue, recapText } = await import('../src/shared/stats.mjs')
  const sun = (h) => new Date(2026, 10, 22, h, 0).getTime() // Sunday 22 Nov 2026
  assert.equal(recapDue(sun(18), ''), null, 'not before 19:00')
  assert.equal(recapDue(sun(20), ''), '2026-11-22')
  assert.equal(recapDue(sun(20), '2026-11-22'), null, 'shown already')
  assert.equal(recapDue(sun(24 + 9), ''), '2026-11-22', 'Monday morning catches a missed Sunday')
  assert.equal(recapDue(sun(24 + 13), ''), null, 'not after Monday noon')
  assert.equal(recapDue(sun(-24 * 3 + 20), ''), null, 'not on a Thursday')
  assert.equal(recapText({ plays: 0 }), null, 'nothing played: no recap')
  const t = recapText({
    plays: 3,
    ms: 125 * 60000,
    topSongs: [{ title: 'A', artist: 'B', plays: 2 }]
  })
  assert.equal(t.title, 'Your week in music: 2 h 05 min')
  assert.match(t.body, /Top song: A by B \(2 plays\)/)
})

test('"On this day": what you played a lot a month and a year ago, only when you did', async () => {
  const { onThisDay } = await import('../src/shared/stats.mjs')
  const now = new Date(2026, 10, 22, 20, 0).getTime()
  const monthAgo = new Date(2026, 9, 22, 18, 0).getTime()
  const yearAgo = new Date(2025, 10, 23, 12, 0).getTime()
  const p = (at, title) => ({ at, ms: 180000, title, artist: 'Band' })
  const plays = [
    p(monthAgo, 'Loved'),
    p(monthAgo + 86400000, 'Loved'),
    p(monthAgo - 2 * 86400000, 'Loved'),
    p(monthAgo, 'Once'),
    p(yearAgo, 'Twice'),
    p(yearAgo, 'Twice'),
    p(monthAgo - 10 * 86400000, 'Loved') // outside the week
  ]
  const r = onThisDay(plays, now)
  assert.equal(r.length, 1, 'twice a year ago is not "a lot"')
  assert.equal(r[0].when, 'month')
  assert.equal(r[0].title, 'Loved')
  assert.equal(r[0].plays, 3)
  assert.deepEqual(onThisDay([], now), [])
})

test('your year in music: totals, top songs, biggest day and longest run', async () => {
  const { yearInMusic, yearDue } = await import('../src/shared/stats.mjs')
  const at = (m, d, h = 12) => new Date(2026, m, d, h).getTime()
  const p = (t, title, artist = 'Band', min = 3) => ({ at: t, ms: min * 60000, title, artist })
  const plays = [
    p(at(10, 20), 'A'),
    p(at(10, 21), 'A'),
    p(at(10, 22), 'B'),
    p(at(10, 22, 14), 'A', 'Band', 30), // the biggest day
    p(at(10, 25), 'C'),
    p(at(9, 1), 'D', 'Other'),
    p(new Date(2025, 11, 31).getTime(), 'Last year')
  ]
  const y = yearInMusic(plays, 2026, at(11, 5))
  assert.equal(y.plays, 6)
  assert.equal(y.topSongs[0].title, 'A')
  assert.equal(y.topDay.date, '2026-11-22')
  assert.deepEqual(y.streak, { days: 3, from: '2026-11-20', to: '2026-11-22' })
  assert.ok(y.since, 'the history began in October, not January')
  assert.equal(y.months[10], 42 * 60000)
  assert.equal(
    y.months.reduce((a, b) => a + b, 0),
    y.ms
  )
  assert.equal(yearInMusic(plays, 2024, at(11, 5)), null, 'nothing that year')
  assert.equal(yearDue(at(10, 30), ''), null, 'not in November')
  assert.equal(yearDue(at(11, 1), ''), '2026')
  assert.equal(yearDue(at(11, 20), '2026'), null, 'once a year')
})

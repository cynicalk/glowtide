import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_KIND, makeBackup, mergePlays, readBackup } from '../src/shared/backup.mjs'

const play = (at, title) => ({ at, ms: 60000, title, artist: 'Band', album: '', source: 'system' })
const T = Date.UTC(2026, 10, 1)

test('a backup carries your setup but never sign-in secrets', () => {
  const b = makeBackup({
    version: '1.0.21',
    now: T,
    settings: {
      googleClientId: 'id',
      googleClientSecret: 'secret',
      recapLast: '2026-11-22',
      remote: { enabled: true },
      background: { kind: 'video', file: 'bg-3.mp4', opacity: 70 },
      lyrics: { style: 'constellation' }
    },
    myLyrics: { 'band|song': { lrc: '[00:01.00] hi', saved: 'x' } },
    plays: [play(T, 'Song')]
  })
  assert.equal(b.kind, BACKUP_KIND)
  assert.ok(!('googleClientSecret' in b.settings))
  assert.ok(!('recapLast' in b.settings))
  assert.ok(!('googleClientId' in b.settings), 'sign-ins are set up on each PC')
  assert.equal(b.settings.remote.enabled, false, 'the remote waits to be turned on again')
  assert.equal(b.settings.background.kind, 'cover', 'a picture or video stays on this PC')
  // and it reads back whole
  const r = readBackup(JSON.stringify(b))
  assert.equal(r.error, undefined)
  assert.equal(r.settings.lyrics.style, 'constellation')
  assert.deepEqual(r.counts, { lyrics: 1, choices: 0, offsets: 0, plays: 1, favs: 0 })
})

test('anything that is not a Glowtide backup is turned away', () => {
  for (const raw of ['', 'nope', '[]', '{}', JSON.stringify({ kind: 'other', format: 1 })])
    assert.ok(readBackup(raw).error, raw)
  assert.ok(readBackup(JSON.stringify({ kind: BACKUP_KIND, format: 2 })).error, 'a newer format')
})

test('a hand-made backup gets only what Glowtide keeps, in the right shapes', () => {
  const evil = {
    kind: BACKUP_KIND,
    format: 1,
    settings: {
      googleClientSecret: 'planted',
      clientId: 'their-spotify-app',
      googleClientId: 'their-google-app',
      lyrics: { style: 'stack' }
    },
    myLyrics: {
      'band|ok': { lrc: '[00:01.00] fine' },
      'band|huge': { lrc: 'x'.repeat(300000) },
      nokey: { lrc: 'x' },
      'band|wrong': 'not an object',
      ['__proto__']: { lrc: 'x' }
    },
    choices: { 'band|a': 42, 'band|b': -1, 'band|c': '42' },
    offsets: { 'band|a': 250, 'band|b': 999999, 'band|c': 'soon' },
    plays: [
      play(T, 'Good'),
      { at: T, ms: 1000, title: '' },
      { at: 5, ms: 1000, title: 'Before 2020' },
      { at: T, ms: 10 * 3600000, title: 'Ten hours' },
      { at: T, ms: 1000, title: 'x', source: 'file:///etc' },
      'junk'
    ]
  }
  const r = readBackup(JSON.stringify(evil))
  assert.ok(!('googleClientSecret' in r.settings))
  assert.ok(!('clientId' in r.settings) && !('googleClientId' in r.settings), 'no app IDs planted')
  assert.deepEqual(Object.keys(r.myLyrics), ['band|ok'])
  assert.deepEqual(r.choices, { 'band|a': 42 })
  assert.deepEqual(r.offsets, { 'band|a': 250 })
  assert.deepEqual(
    r.plays.map((p) => p.title),
    ['Good', 'x']
  )
  assert.equal(r.plays[1].source, 'system', 'an unknown source becomes a plain one')
  assert.equal(Object.getPrototypeOf(r.myLyrics), Object.prototype)
})

test('importing history adds the plays you do not have, once', () => {
  const mine = [play(T, 'A'), play(T + 1000, 'B')]
  const theirs = [play(T + 1000, 'B'), play(T - 5000, 'Old'), play(T + 9000, 'New')]
  const out = mergePlays(mine, theirs)
  assert.deepEqual(
    out.map((p) => p.title),
    ['Old', 'A', 'B', 'New']
  )
  assert.equal(mergePlays(out, theirs).length, 4, 'importing twice changes nothing')
})

test('starred lines travel in a backup, checked like the rest', () => {
  const r = readBackup(
    JSON.stringify({
      kind: BACKUP_KIND,
      format: 1,
      favs: [
        {
          key: 'band|song',
          text: ' a line ',
          title: 'Song',
          artist: 'Band',
          cover: 'https://i.scdn.co/x',
          at: 5
        },
        { key: 'nokey', text: 'x' },
        { key: 'band|b', text: '' },
        { key: 'band|c', text: 'ok', cover: 'javascript:alert(1)' }
      ]
    })
  )
  assert.equal(r.favs.length, 2)
  assert.equal(r.favs[0].text, 'a line')
  assert.equal(r.favs[1].cover, null, 'only real pictures')
})

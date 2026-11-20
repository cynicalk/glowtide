import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tapTargets, tap, undoTap, lrcTag, toLrc, timedLines } from '../src/shared/tapsync.mjs'
import { parseLrc } from '../src/shared/lyrics.mjs'

const lines = [{ text: 'first' }, { text: '' }, { text: ' second ' }, { text: 'third' }]

test('only lines with words are tapped', () => {
  assert.deepEqual(tapTargets(lines), [0, 2, 3])
  assert.deepEqual(tapTargets(null), [])
})

test('taps run forward, ignore key bounces, and stop at the last line', () => {
  let t = []
  t = tap(t, 1000, 3)
  t = tap(t, 1040, 3) // a bounce
  t = tap(t, 2500, 3)
  t = tap(t, 2000, 3) // earlier than the one before: ignored
  assert.deepEqual(t, [1000, 2500])
  t = tap(t, 4000, 3)
  t = tap(t, 9000, 3) // past the last line
  assert.deepEqual(t, [1000, 2500, 4000])
  assert.deepEqual(undoTap(t), [1000, 2500])
  assert.deepEqual(tap([], NaN, 3), [])
})

test('a tap before the previous one (the song seeked back) is ignored', () => {
  assert.deepEqual(tap([5000], 3000, 3), [5000])
  assert.deepEqual(tap([5000], 5200, 3), [5000, 5200])
})

test('LRC time tags', () => {
  assert.equal(lrcTag(0), '[00:00.00]')
  assert.equal(lrcTag(83456), '[01:23.46]')
  assert.equal(lrcTag(-5), '[00:00.00]')
  assert.equal(lrcTag(600000), '[10:00.00]')
})

test('saved as LRC that Glowtide reads back exactly', () => {
  const timed = timedLines(lines, [1000, 2500, 4000])
  assert.deepEqual(timed, [
    { t: 1000, text: 'first' },
    { t: 2500, text: 'second' },
    { t: 4000, text: 'third' }
  ])
  const lrc = toLrc(timed, { title: 'A [b] song', artist: 'Someone' })
  assert.ok(
    lrc.startsWith('[ti:A  b  song]\n[ar:Someone]\n[re:Glowtide tap-to-sync]\n'),
    'title and artist, brackets taken out'
  )
  assert.deepEqual(
    parseLrc(lrc).map((l) => [l.t, l.text]),
    [
      [1000, 'first'],
      [2500, 'second'],
      [4000, 'third']
    ]
  )
})

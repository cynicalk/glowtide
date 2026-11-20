import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tapTargets,
  tap,
  undoTap,
  lrcTag,
  toLrc,
  timedLines,
  wordTargets,
  wordTimedLines
} from '../src/shared/tapsync.mjs'
import { parseLrc, enhancedLrcLines, hasWordTags } from '../src/shared/lyrics.mjs'

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

test('word by word: every word in order, then lines with all their words timed', () => {
  const lines = [
    { t: 1000, text: 'one two' },
    { t: 3000, text: '' },
    { t: 4000, text: 'three four five' }
  ]
  assert.deepEqual(
    wordTargets(lines).map((x) => [x.li, x.wi, x.w]),
    [
      [0, 0, 'one'],
      [0, 1, 'two'],
      [2, 0, 'three'],
      [2, 1, 'four'],
      [2, 2, 'five']
    ]
  )
  // the first line fully tapped, the second only partly: it keeps its line time
  assert.deepEqual(wordTimedLines(lines, [1100, 1500, 4100]), [
    {
      t: 1100,
      text: 'one two',
      words: [
        { t: 1100, w: 'one' },
        { t: 1500, w: 'two' }
      ]
    },
    { t: 4000, text: 'three four five' }
  ])
})

test('word times are written as enhanced LRC and read back as measured', () => {
  const timed = wordTimedLines([{ t: 1000, text: 'one two three' }], [1000, 1400, 2000])
  const lrc = toLrc(timed, { title: 'T', artist: 'A' })
  assert.ok(hasWordTags(lrc))
  assert.match(lrc, /\[00:01\.00\]<00:01\.00>one <00:01\.40>two <00:02\.00>three/)
  const back = enhancedLrcLines(lrc, 10000)
  assert.deepEqual(
    back[0].words.map((w) => [w.w, w.t]),
    [
      ['one', 1000],
      ['two', 1400],
      ['three', 2000]
    ]
  )
})

test('words tapped late never push a line out of order', () => {
  const lines = [
    { t: 1000, text: 'a b' },
    { t: 2000, text: 'c' }
  ]
  // the first line's words tapped after the second line's start
  const out = wordTimedLines(lines, [2400, 2600])
  assert.deepEqual(
    out.map((l) => l.t),
    [2400, 2610]
  )
})

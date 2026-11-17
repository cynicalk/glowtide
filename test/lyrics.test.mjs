import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseLrc,
  estimateWordTiming,
  wordWindowAt,
  lineIndexAt,
  lineWindowAt
} from '../src/shared/lyrics.mjs'

test('parses timestamps with 2- and 3-digit fractions, sorted', () => {
  const l = parseLrc('[00:12.50] second\n[00:01.123] first\nno tag line\n[01:02] third')
  assert.deepEqual(
    l.map(({ t, text }) => ({ t, text })),
    [
      { t: 1123, text: 'first' },
      { t: 12500, text: 'second' },
      { t: 62000, text: 'third' }
    ]
  )
})

test('a line with several time tags repeats at each time', () => {
  const l = parseLrc('[00:01.00][00:30.00] chorus')
  assert.deepEqual(
    l.map((x) => x.t),
    [1000, 30000]
  )
})

test('[offset:] shifts lyrics earlier', () => {
  const l = parseLrc('[offset:+500]\n[00:02.00] hi')
  assert.equal(l[0].t, 1500)
})

test('untimed or empty input yields no lines (never invented timing)', () => {
  assert.deepEqual(parseLrc('just plain lyrics\nno timing'), [])
  assert.deepEqual(parseLrc(null), [])
})

test('word timing stays inside the line and in order', () => {
  const [line] = estimateWordTiming(parseLrc('[00:10.00] one two three\n[00:14.00] next'), 60000)
  assert.equal(line.words.length, 3)
  assert.equal(line.words[0].t, 10000)
  for (let i = 1; i < 3; i++) assert.ok(line.words[i].t >= line.words[i - 1].end - 1)
  assert.ok(line.end <= 14000)
})

test('a long instrumental gap is not stretched across the last word', () => {
  const [line] = estimateWordTiming(
    parseLrc('[00:00.00] short line\n[00:40.00] after the break'),
    90000
  )
  assert.ok(line.end - line.t < 3000, `sung ${line.end - line.t}ms`)
})

test('a slowly sung line fills its time instead of racing ahead and going blank', () => {
  // Regression: a 6-word line with 7.3 s until the next one was shown in 3 s, then blank.
  const [line] = estimateWordTiming(
    parseLrc('[00:27.30] one two three four five six\n[00:34.60] next line'),
    250000
  )
  assert.ok(line.end - line.t >= 6500, `sung ${line.end - line.t}ms`)
  assert.ok(line.end <= 34600)
})

test('line window: held until the next line, cleared in long breaks and at gap markers', () => {
  const lines = estimateWordTiming(
    parseLrc(
      '[00:10.00] first line here\n[00:16.00] second line\n[00:20.00]\n[00:30.00] after the gap\n[01:30.00] much later'
    ),
    120000
  )
  assert.equal(lineWindowAt(lines, 5000).cur, null)
  assert.equal(lineWindowAt(lines, 5000).next.text, 'first line here')
  const w = lineWindowAt(lines, 15900)
  assert.equal(w.cur.text, 'first line here', 'held right up to the next line')
  assert.equal(w.next.text, 'second line')
  assert.equal(lineWindowAt(lines, 16100).prev.text, 'first line here')
  assert.equal(lineWindowAt(lines, 21000).cur, null, 'an empty LRC line ends the line before it')
  assert.equal(lineWindowAt(lines, 31000).cur.text, 'after the gap')
  assert.equal(lineWindowAt(lines, 60000).cur, null, 'a long instrumental break clears')
  assert.equal(lineWindowAt(lines, 91000).cur.text, 'much later')
})

test('empty lyric lines (gap markers) have no words', () => {
  const lines = estimateWordTiming(parseLrc('[00:01.00] a b\n[00:03.00]\n[00:09.00] c'), 20000)
  assert.equal(lines[1].words.length, 0)
})

test('word window: prev / cur / next, and quiet in gaps', () => {
  const lines = estimateWordTiming(parseLrc('[00:01.00] alpha beta gamma\n[00:20.00] delta'), 30000)
  assert.equal(wordWindowAt(lines, 500).cur, null)
  assert.equal(wordWindowAt(lines, 500).next.w, 'alpha')
  const w = wordWindowAt(lines, lines[0].words[1].t + 10)
  assert.equal(w.prev.w, 'alpha')
  assert.equal(w.cur.w, 'beta')
  assert.equal(w.next.w, 'gamma')
  assert.equal(wordWindowAt(lines, 12000).cur, null, 'mid-gap the overlay goes quiet')
  assert.equal(wordWindowAt(lines, 20100).cur.w, 'delta')
})

test('line index', () => {
  const lines = parseLrc('[00:01.00] a\n[00:05.00] b')
  assert.equal(lineIndexAt(lines, 0), -1)
  assert.equal(lineIndexAt(lines, 3000), 0)
  assert.equal(lineIndexAt(lines, 9000), 1)
})

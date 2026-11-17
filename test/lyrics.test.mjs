import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLrc, estimateWordTiming, wordWindowAt, lineIndexAt } from '../src/shared/lyrics.mjs'

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
  assert.ok(line.end - line.t < 2000, `sung ${line.end - line.t}ms`)
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

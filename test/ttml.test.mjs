// Fixtures are made-up lines in the AMLL TTML / enhanced LRC formats, not real lyrics.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTtml, ttmlTime } from '../src/shared/ttml.mjs'
import { enhancedLrcLines, hasWordTags, parseLrc, wordWindowAt } from '../src/shared/lyrics.mjs'

const TTML = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:amll="x">
<head><metadata><amll:meta key="musicName" value="Paper Lanterns"/><amll:meta key="spotifyId" value="abc123"/></metadata></head>
<body dur="3:10.500"><div>
<p begin="12.000" end="14.000"><span begin="12.000" end="12.400">We&apos;re</span> <span begin="12.400" end="12.700">all</span> <span begin="12.700" end="13.100">glow</span><span begin="13.100" end="13.900">ing</span><span ttm:role="x-translation" xml:lang="fr">Nous brillons</span></p>
<p begin="15.000" end="17.000"><span begin="15.000" end="15.500">over </span><span begin="15.500" end="16.000">&amp; </span><span begin="16.000" end="16.800">out</span><span ttm:role="x-bg"><span begin="16.100" end="16.600">(out)</span></span></p>
<p begin="1:02.000" end="1:03.000"><span ttm:role="x-translation">only a translation</span></p>
</div></body></tt>`

test('TTML times', () => {
  assert.equal(ttmlTime('27.173'), 27173)
  assert.equal(ttmlTime('3:14.571'), 194571)
  assert.equal(ttmlTime('1:02:03.5'), 3723500)
  assert.equal(ttmlTime('12.5s'), 12500)
  assert.equal(ttmlTime('450ms'), 450)
  assert.ok(Number.isNaN(ttmlTime('soon')))
})

test('TTML: syllables join into words, spaces split them, entities decode', () => {
  const { lines, durationMs, meta } = parseTtml(TTML)
  assert.equal(durationMs, 190500)
  assert.equal(meta.spotifyId, 'abc123')
  assert.equal(lines.length, 2, 'a line with only a translation is dropped')
  assert.deepEqual(
    lines[0].words.map((w) => w.w),
    ["We're", 'all', 'glowing']
  )
  assert.deepEqual(lines[0].words[2], { w: 'glowing', t: 12700, end: 13900 })
  assert.equal(lines[0].text, "We're all glowing")
})

test('TTML: translations and background vocals stay out of the lead line', () => {
  const { lines } = parseTtml(TTML)
  assert.deepEqual(
    lines[1].words.map((w) => w.w),
    ['over', '&', 'out']
  )
  assert.ok(!lines[0].text.includes('Nous'))
})

test('TTML: trailing space inside a span still splits words', () => {
  const { lines } = parseTtml(TTML)
  assert.equal(lines[1].words[0].end, 15500)
  assert.equal(lines[1].words[1].t, 15500)
})

test('TTML output drives the word window like estimated lyrics do', () => {
  const { lines } = parseTtml(TTML)
  const w = wordWindowAt(lines, 12800)
  assert.equal(w.cur.w, 'glowing')
  assert.equal(w.prev.w, 'all')
  assert.equal(w.next.w, 'over')
})

test('junk input is empty, not an exception', () => {
  assert.deepEqual(parseTtml('').lines, [])
  assert.deepEqual(parseTtml('<html>nope</html>').lines, [])
})

const ELRC = `[00:10.00]<00:10.00>Lanterns <00:10.80>rise <00:11.50>tonight<00:12.40>
[00:13.00]<00:13.00>over the <00:14.00>water
[00:16.00]plain line no word tags`

test('enhanced LRC: detection and clean text', () => {
  assert.ok(hasWordTags(ELRC))
  assert.ok(!hasWordTags('[00:01.00] hi'))
  assert.equal(parseLrc(ELRC)[0].text, 'Lanterns rise tonight', 'word tags never show as text')
})

test('enhanced LRC: measured word times, closing tag ends the last word', () => {
  const lines = enhancedLrcLines(ELRC, 60000)
  assert.deepEqual(lines[0].words, [
    { w: 'Lanterns', t: 10000, end: 10800 },
    { w: 'rise', t: 10800, end: 11500 },
    { w: 'tonight', t: 11500, end: 12400 }
  ])
})

test('enhanced LRC: a tagged phrase is split only inside its own span', () => {
  const [, l] = enhancedLrcLines(ELRC, 60000)
  assert.equal(l.words[0].w, 'over')
  assert.equal(l.words[0].t, 13000)
  assert.equal(l.words[1].w, 'the')
  assert.ok(l.words[1].end <= 14000)
  assert.equal(l.words[2].t, 14000)
})

test('enhanced LRC: a line without word tags falls back to the estimate', () => {
  const lines = enhancedLrcLines(ELRC, 60000)
  assert.equal(lines[2].words[0].w, 'plain')
  assert.equal(lines[2].words.length, 5)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  constellationAt,
  buildFigures,
  pickConstellation,
  placeStars,
  seedOf,
  VIEW
} from '../src/shared/constellation.mjs'
import { CONSTELLATIONS } from '../src/shared/skyCatalog.mjs'
import { SKY_DATA } from '../src/shared/skyData.mjs'
import { SKY_INFO } from '../src/shared/skyInfo.mjs'
import { estimateWordTiming, parseLrc } from '../src/shared/lyrics.mjs'

const LRC = `[00:10.00] paper lanterns rise
[00:14.00] over the harbour wall
[00:30.00] after a long pause`
const lines = estimateWordTiming(parseLrc(LRC), 60000)

test('catalogue: every figure is well formed and described', () => {
  assert.equal(CONSTELLATIONS.length, 89, 'all 88, with Serpens in two halves')
  const ids = new Set()
  for (const c of CONSTELLATIONS) {
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`)
    ids.add(c.id)
    assert.ok(c.name && c.title && c.desc.length > 30 && c.desc.length < 160, c.id)
    assert.ok(c.stars.length >= 2)
    for (const [a, b] of c.edges) assert.ok(c.stars[a] && c.stars[b], `${c.id} edge ${a}-${b}`)
    for (const [x, y] of c.stars) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, c.id)
  }
})

test('figures are fitted inside the view', () => {
  for (const c of CONSTELLATIONS) {
    for (const s of placeStars(c)) {
      assert.ok(s.x > 100 && s.x < VIEW.w - 100 && s.y > 120 && s.y < VIEW.h - 150, c.id)
    }
  }
})

test('a song walks through different constellations, never the same twice in a row', () => {
  const seed = seedOf('some song')
  for (let n = 0; n < 20; n++)
    assert.notEqual(pickConstellation(seed, n).id, pickConstellation(seed, n + 1).id)
  assert.deepEqual(pickConstellation(seed, 3), pickConstellation(seed, 3))
})

test('verses fill a figure star by star and never mix across a long pause', () => {
  const figs = buildFigures(lines, 1)
  for (const f of figs) {
    assert.ok(f.words.length <= f.cons.stars.length)
    assert.equal(new Set(f.words.map((w) => w.section)).size, 1)
  }
  const last = figs[figs.length - 1]
  assert.equal(last.words[0].w, 'after', 'the verse after the pause starts its own figure')
})

test('words mode: stars light as words are sung, the rest of the figure waits unlit', () => {
  const t = lines[0].words[1].t + 10
  const sky = constellationAt(lines, t, { seed: 1 })
  assert.ok(sky.figure.name)
  const lit = sky.stars.filter((s) => s.lit)
  assert.deepEqual(
    lit.map((s) => s.word),
    ['paper', 'lanterns']
  )
  assert.ok(
    sky.stars.some((s) => !s.lit),
    'the whole figure shows before it is filled'
  )
  assert.equal(sky.focus.text, 'lanterns')
  assert.ok(sky.edges.every((e) => e.lit === (sky.stars[e.a].lit && sky.stars[e.b].lit)))
})

test('before the first word the first figure is shown unlit', () => {
  const sky = constellationAt(lines, 5000, { seed: 1 })
  assert.ok(sky.figure)
  assert.equal(sky.stars.filter((s) => s.lit).length, 0)
  assert.equal(sky.focus, null)
})

test('lines mode: a whole line lights at its start and is the focus', () => {
  const sky = constellationAt(lines, 14100, { mode: 'lines', seed: 1 })
  assert.equal(sky.focus.text, 'over the harbour wall')
  const current = sky.stars.filter((s) => s.current).map((s) => s.word)
  assert.ok(current.length >= 1)
  for (const w of current) assert.ok('over the harbour wall'.split(' ').includes(w))
})

test('quiet in a pause: no focus', () => {
  const sky = constellationAt(lines, 25000, { seed: 1 })
  assert.equal(sky.focus, null)
})

test('every generated figure has a name and note, and every note has a figure', () => {
  assert.deepEqual(Object.keys(SKY_DATA).sort(), Object.keys(SKY_INFO).sort())
})

test('a long song visits many different constellations', () => {
  const seed = seedOf('long song')
  const seen = new Set()
  for (let n = 0; n < 89; n++) seen.add(pickConstellation(seed, n).id)
  assert.equal(seen.size, 89, 'every figure before any repeats')
})

test('a line is never split across two constellations when a figure can hold it', () => {
  const lrc = Array.from(
    { length: 12 },
    (_, i) => `[00:${String(10 + i * 3).padStart(2, '0')}.00] one two three four five`
  ).join('\n')
  const ls = estimateWordTiming(parseLrc(lrc), 90000)
  for (const seed of [1, 2, 3, 99]) {
    const figs = buildFigures(ls, seed)
    const owner = new Map()
    for (const f of figs)
      for (const w of f.words) owner.set(w.line, (owner.get(w.line) || new Set()).add(f.n))
    for (const [line, set] of owner) assert.equal(set.size, 1, `seed ${seed} line ${line} split`)
  }
})

test('labels: recent lines only, and no two label boxes overlap', async () => {
  const { labelledStars } = await import('../src/shared/constellation.mjs')
  const stars = [
    { x: 100, y: 100, word: 'old', line: 0, lit: true },
    { x: 400, y: 100, word: 'previous', line: 1, lit: true },
    { x: 410, y: 104, word: 'crowding', line: 1, lit: true }, // right on top of "previous"
    { x: 700, y: 300, word: 'this', line: 2, lit: true },
    { x: 900, y: 300, word: 'now', line: 2, lit: true, current: true },
    { x: 1100, y: 300, word: 'later', line: 3, lit: false }
  ]
  const set = labelledStars(stars)
  assert.ok(!set.has(0), 'a line from long ago is not labelled')
  assert.ok(set.has(3), 'the current line is labelled')
  assert.ok(!set.has(4), 'the current word has the caption, not a label')
  assert.ok(!set.has(5), 'unlit stars are not labelled')
  assert.equal([1, 2].filter((i) => set.has(i)).length, 1, 'of two crowding labels only one shows')
})

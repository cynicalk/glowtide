import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  constellationAt,
  buildFigures,
  pickConstellation,
  placeStars,
  seedOf,
  skyDistance,
  starColour,
  starRadius,
  travelDirection,
  FAMOUS,
  TRAVEL_MS,
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

test('captionLine: stars still light word by word, the caption is the whole line', () => {
  const t = lines[0].words[1].t + 10
  const sky = constellationAt(lines, t, { seed: 1, captionLine: true })
  assert.equal(sky.stars.filter((s) => s.lit).length, 2)
  assert.equal(sky.focus.text, 'paper lanterns rise')
  assert.equal(
    sky.stars.filter((s) => s.current).length,
    1,
    'one focus star, so the rest get labels'
  )
})

test('every lit word sits outward from the figure, never on another word or star', async () => {
  const { placeLabels } = await import('../src/shared/constellation.mjs')
  const stars = [
    { x: 500, y: 450, word: 'left', line: 1, lit: true },
    { x: 900, y: 450, word: 'right', line: 1, lit: true },
    { x: 700, y: 300, word: 'top', line: 1, lit: true },
    { x: 700, y: 600, word: 'bottom', line: 1, lit: true },
    { x: 905, y: 452, word: 'crowded', line: 1, lit: true },
    { x: 700, y: 450, word: 'now', line: 1, lit: true, current: true },
    { x: 1100, y: 450, word: 'later', line: 2, lit: false }
  ]
  const p = placeLabels(stars)
  assert.equal(p.get(0).anchor, 'end', 'a star left of centre is labelled on its left')
  assert.equal(p.get(1).anchor, 'start', 'a star right of centre is labelled on its right')
  assert.ok(p.get(2).y < 300, 'a star above the centre is labelled above')
  assert.ok(p.get(3).y > 600, 'a star below the centre is labelled below')
  assert.ok(p.has(5), 'the word being sung is part of the figure too')
  assert.ok(!p.has(6), 'a word not yet sung has no label')
  assert.ok(
    !(p.has(4) && p.get(4).y === p.get(1).y && p.get(4).anchor === p.get(1).anchor),
    'crowding words do not stack on top of each other'
  )
})

test('a placed word never moves as later words light', async () => {
  const { placeLabels } = await import('../src/shared/constellation.mjs')
  const sky = constellationAt(lines, 59000, { seed: 7 })
  const all = sky.stars.map((s) => ({ ...s, lit: !!s.word }))
  const final = placeLabels(all)
  for (let n = 1; n <= all.length; n++) {
    const part = placeLabels(all.map((s, i) => ({ ...s, lit: s.lit && i < n })))
    for (const [i, at] of part) assert.deepEqual(at, final.get(i), `word ${i} moved`)
  }
})

// --- choosing figures: fit, fame, neighbours, chorus ---

const CHORUS = ['we light the sky tonight', 'every star is ours', 'hold on hold on']
const VERSE = (n) => [
  `verse ${n} begins with something new`,
  `and walks a little further on`,
  `before it turns around again`
]
// verse, chorus, verse, chorus, chorus: sections apart by 6 s pauses
function song() {
  const parts = [VERSE(1), CHORUS, VERSE(2), CHORUS, CHORUS]
  let t = 5000
  const rows = []
  for (const part of parts) {
    for (const text of part) {
      const s = Math.floor(t / 1000)
      rows.push(
        `[${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.00] ${text}`
      )
      t += 3000
    }
    t += 12000
  }
  return estimateWordTiming(parseLrc(rows.join('\n')), t + 5000)
}

test('a chorus that comes back returns to its own constellation', () => {
  for (const seed of [1, 2, 3, 42]) {
    const figs = buildFigures(song(), seed)
    const chorusFig = (from) =>
      figs
        .filter((f) => f.words[0].line >= from && f.words[0].line < from + 3)
        .map((f) => f.cons.id)
    // lines 3-5, 9-11 and 12-14 are the chorus
    assert.deepEqual(chorusFig(9), chorusFig(3), `seed ${seed}`)
    assert.deepEqual(chorusFig(12), chorusFig(3), `seed ${seed}`)
    // a verse doesn't take the chorus's figure
    assert.ok(!chorusFig(6).some((id) => chorusFig(3).includes(id)), `seed ${seed}`)
  }
})

test('figures are well known ones that fit the verse', () => {
  let famous = 0
  let all = 0
  for (let seed = 0; seed < 40; seed++) {
    for (const f of buildFigures(song(), seed)) {
      all++
      if (FAMOUS.has(f.cons.id)) famous++
      // most of a figure's stars carry a word: no near-empty sky
      assert.ok(f.words.length / f.cons.stars.length >= 0.5, `${f.cons.id} ${f.words.length}`)
    }
  }
  assert.ok(famous / all > 0.7, `famous ${famous}/${all}`)
})

test('songs start in different places', () => {
  const firsts = new Set()
  for (let seed = 0; seed < 30; seed++) firsts.add(buildFigures(song(), seed * 7919)[0].cons.id)
  assert.ok(firsts.size >= 5, [...firsts].join(' '))
})

test('a song travels to neighbours rather than jumping across the sky', () => {
  const d = []
  for (let seed = 0; seed < 30; seed++) {
    const figs = buildFigures(song(), seed)
    for (let i = 1; i < figs.length; i++)
      if (figs[i].cons.id !== figs[i - 1].cons.id)
        d.push(skyDistance(figs[i - 1].cons.centre, figs[i].cons.centre))
  }
  d.sort((a, b) => a - b)
  assert.ok(d[d.length >> 1] < 60, `median ${d[d.length >> 1]}`)
})

test('every figure knows where it is in the sky', () => {
  for (const c of CONSTELLATIONS) {
    const [ra, dec] = c.centre
    assert.ok(ra >= 0 && ra < 360 && dec >= -90 && dec <= 90, c.id)
  }
  const ori = CONSTELLATIONS.find((c) => c.id === 'Ori').centre
  assert.ok(Math.abs(ori[0] - 83) < 6 && Math.abs(ori[1] - 5) < 8, 'Orion sits on the equator')
})

test('travel direction: east is to the left, north is up', () => {
  const [ex, ey] = travelDirection([100, 0], [110, 0])
  assert.ok(ex < -0.99 && Math.abs(ey) < 0.01, 'east is to the left')
  const [wx] = travelDirection([100, 0], [90, 0])
  assert.ok(wx > 0.99, 'west is to the right')
  const up = travelDirection([100, 10], [100, 30])
  assert.ok(up[1] < -0.99, 'north is up the screen')
  assert.equal(travelDirection([100, 10], [100, 10]), null, 'the same place: no journey')
})

test('stars take their real colour and brightness', () => {
  const rgb = (s) => s.match(/\d+/g).map(Number)
  const [r1, , b1] = rgb(starColour(-0.03)) // Rigel: blue-white
  const [r2, , b2] = rgb(starColour(1.85)) // Betelgeuse: orange
  assert.ok(b1 > r1 && r2 > b2)
  assert.equal(starColour(null), '#ffffff')
  assert.ok(starRadius({ mag: -1.46 }) > starRadius({ mag: 4 }), 'Sirius outshines a faint star')
  const ori = placeStars(CONSTELLATIONS.find((c) => c.id === 'Ori'))
  const bright = ori.reduce((a, s) => (s.mag < a.mag ? s : a))
  assert.ok(bright.mag < 0.6, 'Rigel or Betelgeuse is in the figure')
})

test('a finished figure sets off for the next in time to arrive as it begins', () => {
  const ls = song()
  const figs = buildFigures(ls, 5)
  // the first figure that follows a pause long enough for the whole journey
  const n = figs.findIndex(
    (f, i) => i > 0 && f.words[0].t - figs[i - 1].words.at(-1).end > TRAVEL_MS + 500
  )
  assert.ok(n > 0)
  const next = figs[n].words[0]
  const before = constellationAt(ls, next.t - TRAVEL_MS - 200, { seed: 5, figures: figs })
  assert.equal(before.figure.n, n - 1)
  const during = constellationAt(ls, next.t - TRAVEL_MS + 200, { seed: 5, figures: figs })
  assert.equal(during.figure.n, n, 'on the way to the next figure')
  assert.equal(during.stars.filter((s) => s.lit).length, 0, 'nothing lit before its words')
  assert.equal(during.focus, null)
})

test('no word is placed down where the caption is', async () => {
  const { placeLabels } = await import('../src/shared/constellation.mjs')
  const stars = [
    { x: 800, y: 300, word: 'top', line: 1, lit: true },
    { x: 800, y: 700, word: 'lowest', line: 1, lit: true }
  ]
  for (const at of placeLabels(stars, { fontPx: 28 }).values()) assert.ok(at.y <= 720)
})

test('a chorus is recognised even when the song runs straight into it', () => {
  const text = [
    'first verse has its own words here',
    'and another line to follow it',
    'we light the sky tonight',
    'every star is ours',
    'second verse is different again',
    'with nothing like the first one',
    'we light the sky tonight',
    'every star is ours'
  ]
  const lrc = text.map((l, i) => `[00:${String(10 + i * 3).padStart(2, '0')}.00] ${l}`).join('\n')
  const ls = estimateWordTiming(parseLrc(lrc), 60000)
  for (const seed of [1, 2, 3]) {
    const figs = buildFigures(ls, seed)
    const at = (line) => figs.find((f) => f.words[0].line === line)
    assert.ok(at(2) && at(6), `seed ${seed}: each chorus starts a figure`)
    assert.equal(at(6).cons.id, at(2).cons.id, `seed ${seed}`)
  }
})

// Generates src/shared/skyData.mjs: stick figures for all 88 constellations, projected from
// real sky coordinates, with each figure's place in the sky (to travel between neighbours)
// and each star's brightness and colour. Source: d3-celestial's constellations.lines.json
// and stars.6.json (BSD-3-Clause).
//
//   node scripts/build-sky.mjs            (downloads both files)
//   node scripts/build-sky.mjs <folder>   (reads them from a folder instead)
//
// Each figure is projected around its own centre (gnomonic), with east to the left and
// north up as on a sky chart, then scaled into a 0..1 box keeping its proportions.

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/'
const OUT = new URL('../src/shared/skyData.mjs', import.meta.url)
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

const load = async (name) =>
  process.argv[2]
    ? JSON.parse(readFileSync(join(process.argv[2], name), 'utf8'))
    : (await fetch(BASE + name)).json()
const data = await load('constellations.lines.json')
const catalogue = await load('stars.6.json')

// Every star to magnitude 6, bucketed by whole degree, to find each figure's star by position.
const buckets = new Map()
const cell = (ra, dec) => `${Math.floor(ra)},${Math.floor(dec)}`
for (const f of catalogue.features) {
  const [ra, dec] = f.geometry.coordinates
  const k = cell(ra, dec)
  if (!buckets.has(k)) buckets.set(k, [])
  buckets.get(k).push({ ra, dec, mag: f.properties.mag, bv: parseFloat(f.properties.bv) })
}
/** The catalogue star at this position (within 0.1 degree), or null. */
function starAt([ra, dec]) {
  let best = null
  let bestD = 0.1
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const s of buckets.get(cell(ra + i, dec + j)) || []) {
        const d = Math.hypot((s.ra - ra) * Math.cos(rad(dec)), s.dec - dec)
        if (d < bestD) [best, bestD] = [s, d]
      }
  return best
}

// Serpens comes as two features with the same id: the head (west of Ophiuchus) and tail (east).
const features = data.features.map((f) => ({ id: f.id, lines: f.geometry.coordinates }))
const ser = features.filter((f) => f.id === 'Ser')
if (ser.length === 2) {
  const meanRa = (f) => {
    const pts = f.lines.flat()
    const s = pts.reduce((a, p) => a + Math.sin(rad(p[0])), 0)
    const c = pts.reduce((a, p) => a + Math.cos(rad(p[0])), 0)
    return ((Math.atan2(s, c) * 180) / Math.PI + 360) % 360
  }
  const [head, tail] = ser.sort((a, b) => meanRa(a) - meanRa(b))
  head.id = 'SerCaput'
  tail.id = 'SerCauda'
}

function project(lines) {
  const pts = lines.flat()
  // centre: mean direction of the figure's stars
  let x = 0
  let y = 0
  let z = 0
  for (const [ra, dec] of pts) {
    x += Math.cos(rad(dec)) * Math.cos(rad(ra))
    y += Math.cos(rad(dec)) * Math.sin(rad(ra))
    z += Math.sin(rad(dec))
  }
  const ra0 = Math.atan2(y, x)
  const dec0 = Math.atan2(z, Math.hypot(x, y))
  const centre = [+((deg(ra0) + 360) % 360).toFixed(2), +deg(dec0).toFixed(2)]
  const proj = ([ra, dec]) => {
    const a = rad(ra) - ra0
    const d = rad(dec)
    const cosc = Math.sin(dec0) * Math.sin(d) + Math.cos(dec0) * Math.cos(d) * Math.cos(a)
    const px = (Math.cos(d) * Math.sin(a)) / cosc
    const py = (Math.cos(dec0) * Math.sin(d) - Math.sin(dec0) * Math.cos(d) * Math.cos(a)) / cosc
    return [-px, -py] // east left, north up (screen y grows downwards)
  }
  return { proj, centre }
}

const out = {}
for (const f of features) {
  const { proj, centre } = project(f.lines)
  const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`
  const index = new Map()
  const raw = []
  const real = [] // [magnitude, B-V colour index] of each star, when the catalogue has it
  const edges = new Set()
  for (const line of f.lines) {
    let prev = null
    for (const p of line) {
      const k = keyOf(p)
      if (!index.has(k)) {
        index.set(k, raw.length)
        raw.push(proj(p))
        const st = starAt(p)
        real.push(st ? [st.mag, Number.isFinite(st.bv) ? +st.bv.toFixed(2) : null] : [null, null])
      }
      const i = index.get(k)
      if (prev !== null && prev !== i) edges.add(prev < i ? `${prev}-${i}` : `${i}-${prev}`)
      prev = i
    }
  }
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const size = Math.max(x1 - x0, y1 - y0) || 1
  const ox = (1 - (x1 - x0) / size) / 2
  const oy = (1 - (y1 - y0) / size) / 2
  const edgeList = [...edges].map((e) => e.split('-').map(Number))
  const degree = raw.map((_, i) => edgeList.filter(([a, b]) => a === i || b === i).length)
  out[f.id] = {
    // the figure's centre in the sky, [right ascension, declination] in degrees
    centre,
    // [x, y, rank, magnitude, colour]: rank 1 for hub stars (3+ links), 3 for line ends;
    // magnitude (smaller is brighter) and B-V colour index (blue below 0, red above 1.4)
    // are null for the few stars the catalogue doesn't match
    stars: raw.map(([x, y], i) => [
      +(ox + (x - x0) / size).toFixed(3),
      +(oy + (y - y0) / size).toFixed(3),
      degree[i] >= 3 ? 1 : degree[i] === 2 ? 2 : 3,
      real[i][0],
      real[i][1]
    ]),
    edges: edgeList
  }
}

const header = `// GENERATED by scripts/build-sky.mjs - do not edit by hand.
// Constellation stick figures projected from real sky coordinates.
// Source data: d3-celestial, data/constellations.lines.json and data/stars.6.json
//   Copyright (c) 2015, Olaf Frohn. All rights reserved.
//   Redistributed under the BSD 3-Clause License:
//   https://github.com/ofrohn/d3-celestial/blob/master/LICENSE
`
writeFileSync(OUT, `${header}\nexport const SKY_DATA = ${JSON.stringify(out)}\n`)
const all = Object.values(out).flatMap((c) => c.stars)
console.log(
  `wrote ${Object.keys(out).length} constellations; ${all.filter((s) => s[3] !== null).length} of ${all.length} stars matched`
)

// All 88 constellations (Serpens in its two halves): real stick figures from skyData.mjs
// (generated from sky coordinates) joined with their names and notes from skyInfo.mjs.
// Shape: { id, name, title, desc, centre: [ra, dec], stars: [[x, y, rank, mag, bv]],
//   edges: [[a, b]] }

import { SKY_DATA } from './skyData.mjs'
import { SKY_INFO } from './skyInfo.mjs'

export const CONSTELLATIONS = Object.entries(SKY_DATA)
  .filter(([id, d]) => SKY_INFO[id] && d.stars.length >= 2)
  .map(([id, d]) => {
    const [name, title, desc] = SKY_INFO[id]
    return { id, name, title, desc, centre: d.centre, stars: d.stars, edges: d.edges }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

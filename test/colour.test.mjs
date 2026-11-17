import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adjust,
  extractPalette,
  hexToRgb,
  luminance,
  readableOnDark,
  resolveColours,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  textOn
} from '../src/shared/colour.mjs'

function img(parts, order = 'rgba') {
  // parts: [[hex, count]]
  const px = []
  for (const [hex, count] of parts) {
    const [r, g, b] = hexToRgb(hex)
    for (let i = 0; i < count; i++) px.push(...(order === 'bgra' ? [b, g, r, 255] : [r, g, b, 255]))
  }
  return Uint8Array.from(px)
}

test('hex <-> rgb <-> hsl round trip', () => {
  for (const hex of ['#e07a3a', '#000000', '#ffffff', '#3366cc']) {
    assert.equal(rgbToHex(hslToRgb(rgbToHsl(hexToRgb(hex)))), hex)
  }
})

test('palette finds the accent on a mostly black cover', () => {
  const pal = extractPalette(
    img([
      ['#050505', 3000],
      ['#e07a3a', 300],
      ['#f1d9a8', 200]
    ]),
    { order: 'rgba' }
  )
  assert.equal(pal.length, 5)
  assert.equal(pal[0], '#e07a3a', 'saturated accent ranks above the dominant black')
  assert.ok(pal.includes('#f1d9a8'))
})

test('palette reads BGRA (Windows bitmaps) correctly', () => {
  const pal = extractPalette(img([['#2050e0', 500]], 'bgra'), { order: 'bgra' })
  assert.equal(pal[0], '#2050e0')
})

test('a flat single-colour cover still yields five distinct swatches', () => {
  const pal = extractPalette(img([['#336699', 400]]), { order: 'rgba' })
  assert.equal(new Set(pal).size, 5)
})

test('adjust: brightness and saturation move the right way', () => {
  const base = '#996633'
  assert.ok(luminance(adjust(base, { brightness: 20 })) > luminance(base))
  assert.ok(rgbToHsl(hexToRgb(adjust(base, { saturation: -100 })))[1] < 0.01)
})

test('readableOnDark lifts a dark colour to 4.5:1 against black, leaves bright ones alone', () => {
  const lifted = readableOnDark('#2a1a12')
  assert.ok((luminance(lifted) + 0.05) / 0.05 >= 4.5)
  assert.equal(readableOnDark('#f1d9a8'), '#f1d9a8')
})

test('resolveColours uses the chosen swatch per part', () => {
  const pal = ['#e07a3a', '#f1d9a8', '#e0a040', '#6b2e17', '#2a1a12']
  const c = resolveColours(pal, { source: 'album', glow: 0, lyrics: 1, highlight: 2 })
  assert.equal(c.glow, '#e07a3a')
  assert.equal(c.lyrics, '#f1d9a8')
  assert.equal(c.highlight, '#e0a040')
  assert.equal(c.highlightText, textOn('#e0a040'))
})

test('resolveColours custom mode ignores the cover', () => {
  const c = resolveColours(['#e07a3a'], { source: 'custom', custom: '#5fb4ff' })
  assert.equal(c.glow, '#5fb4ff')
})

test('resolveColours survives a missing palette and out-of-range indexes', () => {
  const c = resolveColours(null, { source: 'album', glow: 9, lyrics: -3, highlight: 2 })
  assert.match(c.glow, /^#[0-9a-f]{6}$/)
})

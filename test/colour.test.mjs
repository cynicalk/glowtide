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

test('resolveColours: secondary text has its own swatch and falls back to the lyrics one', () => {
  const pal = ['#e07a3a', '#f1d9a8', '#e0a040', '#6b2e17', '#c0c0c0']
  assert.equal(
    resolveColours(pal, { source: 'album', lyrics: 1, secondary: 4 }).secondary,
    '#c0c0c0'
  )
  assert.equal(resolveColours(pal, { source: 'album', lyrics: 1 }).secondary, '#f1d9a8')
  const dark = resolveColours(pal, { source: 'album', lyrics: 1, secondary: 3 }).secondary
  assert.ok((luminance(dark) + 0.05) / 0.05 >= 3, 'a dark secondary pick is lifted')
})

test('resolveColours custom mode ignores the cover', () => {
  const c = resolveColours(['#e07a3a'], { source: 'custom', custom: '#5fb4ff' })
  assert.equal(c.glow, '#5fb4ff')
})

test('resolveColours survives a missing palette and out-of-range indexes', () => {
  const c = resolveColours(null, { source: 'album', glow: 9, lyrics: -3, highlight: 2 })
  assert.match(c.glow, /^#[0-9a-f]{6}$/)
})

test('hsv: what the colour wheels pick', async () => {
  const { hexToHsv, hsvToHex } = await import('../src/shared/colour.mjs')
  for (const hex of ['#e07a3a', '#000000', '#ffffff', '#3366cc', '#ff0000', '#00ff7f'])
    assert.equal(hsvToHex(hexToHsv(hex)), hex)
  assert.deepEqual(hexToHsv('#ff0000'), [0, 1, 1])
  assert.equal(hsvToHex([120, 1, 1]), '#00ff00')
  assert.equal(hsvToHex([240, 0.5, 0.5]), '#404080')
  assert.equal(hsvToHex([360, 1, 1]), '#ff0000')
})

test('a second glow colour, from the album or the override', () => {
  const pal = ['#ff0000', '#00ff00', '#3366ff', '#ffff00', '#00ffff']
  assert.equal(resolveColours(pal, { source: 'album', glow: 0, glow2: 1 }).glow2, '#00ff00')
  assert.equal(
    resolveColours(pal, { source: 'album', glow: 0 }).glow2,
    '#3366ff',
    'defaults to swatch 3'
  )
  const c = resolveColours(pal, { source: 'custom', custom: '#ff0000', custom2: '#0000ff' })
  assert.equal(c.glow, '#ff0000')
  assert.notEqual(c.glow2, '#0000ff', 'a dark blue is lifted so it shows')
  assert.ok(luminance(c.glow2) >= 0.08)
})

test('colours from settings are checked before they reach the page', async () => {
  const { safeHex } = await import('../src/shared/colour.mjs')
  assert.equal(safeHex('#A1b2C3', '#000000'), '#A1b2C3')
  for (const bad of ['red', '#fff', 'url(x)', '#12345g', '#1234567', null, 5, '#123456; x'])
    assert.equal(safeHex(bad, '#000000'), '#000000')
  const c = resolveColours(['javascript:1', '#00ff00'], {
    source: 'custom',
    custom: 'red;background:url(//x)',
    custom2: '#00ff00'
  })
  assert.match(c.glow, /^#[0-9a-f]{6}$/)
  assert.match(c.glow2, /^#[0-9a-f]{6}$/)
  const a = resolveColours(['bogus', '#00ff00'], { source: 'album', glow: 0, glow2: 1 })
  assert.match(a.glow, /^#[0-9a-f]{6}$/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logBands, smoothInto, shape, hueSweep, vizPalette, THEMES } from '../src/shared/viz.mjs'
import { hexToRgb, rgbToHsl } from '../src/shared/colour.mjs'

test('logBands: a bass tone lands in the low bands, a treble tone in the high ones', () => {
  const bins = 1024 // fftSize 2048 at 48 kHz: 23.4 Hz a bin
  const bass = new Uint8Array(bins)
  bass[4] = 255 // ~94 Hz
  const b = logBands(bass, 32)
  assert.ok(b.slice(0, 8).some((v) => v > 0.5))
  assert.ok(b.slice(16).every((v) => v === 0))
  const treble = new Uint8Array(bins)
  treble[400] = 255 // ~9.4 kHz
  const t = logBands(treble, 32)
  assert.ok(t.slice(24).some((v) => v > 0.5))
  assert.ok(t.slice(0, 16).every((v) => v === 0))
})

test('smoothing rises fast and falls slowly', () => {
  const s = new Float32Array([0, 1])
  smoothInto(s, new Float32Array([1, 0]))
  assert.ok(s[0] > 0.5, 'rise')
  assert.ok(s[1] > 0.8, 'slow fall')
})

test('shape: gain and clamp', () => {
  assert.equal(shape(2), 1)
  assert.equal(shape(0), 0)
  assert.ok(shape(0.2, 2) > shape(0.2, 1))
})

test('hue sweep gives three distinct hues around the accent', () => {
  const [a, b, c] = hueSweep('#7c5cff').map((h) => rgbToHsl(hexToRgb(h))[0])
  const base = rgbToHsl(hexToRgb('#7c5cff'))[0]
  assert.ok(Math.abs(b - base) < 3, 'the middle stop keeps the accent hue')
  assert.notEqual(Math.round(a), Math.round(b))
  assert.notEqual(Math.round(c), Math.round(b))
})

test('album palette: vivid colours lifted; a grey cover gets pale tinted whites', () => {
  const pal = vizPalette('album', {
    palette: ['#101010', '#e07a3a', '#2a1a12', '#5b8cff', '#f1d9a8']
  })
  assert.equal(pal.length, 3)
  for (const hex of pal) assert.ok(rgbToHsl(hexToRgb(hex))[2] >= 0.5, hex)
  const grey = vizPalette('album', { palette: ['#777777', '#888888', '#999999'] })
  for (const hex of grey) assert.ok(rgbToHsl(hexToRgb(hex))[1] < 0.25, 'no invented colour')
})

test('presets and custom', () => {
  assert.deepEqual(vizPalette('ember'), THEMES.ember)
  assert.equal(vizPalette('custom', { accent: '#00ff88' }).length, 3)
  assert.deepEqual(vizPalette('album', {}), THEMES.aurora, 'no cover yet: a pleasant default')
})

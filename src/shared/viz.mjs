// Visualizer maths: frequency bands, smoothing and colour palettes. Pure, no DOM.

import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } from './colour.mjs'

/**
 * Log-spaced bands from an FFT magnitude array (bytes 0..255), like hearing is:
 * a band per few semitones, so bass doesn't get one sliver and treble the whole screen.
 * Returns n values 0..1.
 */
export function logBands(freq, n, { sampleRate = 48000, minHz = 40, maxHz = 16000 } = {}) {
  const bins = freq.length
  const nyquist = sampleRate / 2
  const out = new Float32Array(n)
  const ratio = Math.pow(maxHz / minHz, 1 / n)
  for (let b = 0; b < n; b++) {
    const lo = minHz * Math.pow(ratio, b)
    const hi = lo * ratio
    let i0 = Math.max(0, Math.floor((lo / nyquist) * bins))
    let i1 = Math.min(bins - 1, Math.ceil((hi / nyquist) * bins))
    if (i1 < i0) i1 = i0
    let peak = 0
    let sum = 0
    for (let i = i0; i <= i1; i++) {
      sum += freq[i]
      if (freq[i] > peak) peak = freq[i]
    }
    // blend of peak and mean: lively without being spiky
    out[b] = (0.6 * peak + (0.4 * sum) / (i1 - i0 + 1)) / 255
  }
  return out
}

/** Smooth towards the new values: fast rise, slower fall (classic VU ballistics). */
export function smoothInto(state, next, { rise = 0.55, fall = 0.12 } = {}) {
  for (let i = 0; i < next.length; i++) {
    const a = next[i] > state[i] ? rise : fall
    state[i] += (next[i] - state[i]) * a
  }
  return state
}

/** Shape a band level for display: a sensitivity gain and a gentle curve so quiet music still moves. */
export function shape(v, sensitivity = 1) {
  return Math.min(1, Math.pow(Math.max(0, v * sensitivity), 0.8))
}

/**
 * A designed three-stop palette from one colour: sweep the hue both ways, so it reads as
 * a gradient rather than three shades of the same colour.
 */
export function hueSweep(hex, sweep = 38) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  const sat = Math.max(0.45, s)
  const light = Math.min(0.68, Math.max(0.45, l))
  return [
    rgbToHex(hslToRgb([h - sweep, sat, light + 0.06])),
    rgbToHex(hslToRgb([h, sat, light])),
    rgbToHex(hslToRgb([h + sweep, sat, light - 0.04]))
  ]
}

export const THEMES = {
  aurora: ['#3df5c2', '#4f8cff', '#b45cff'],
  ember: ['#ffcf5a', '#ff7a3d', '#e2325f'],
  ocean: ['#7ef0ff', '#2f9bff', '#4a3dff'],
  neon: ['#ff4fd8', '#8a5cff', '#2ef2ff'],
  sunset: ['#ffd36e', '#ff6b8a', '#7a4cff'],
  mono: ['#ffffff', '#cfd3dc', '#8e95a3']
}

/**
 * The palette a widget paints with.
 * theme 'album': the cover's colours (most vivid three); a mostly grey cover gets pale
 * tinted whites rather than an invented colour. 'custom': a hue sweep of the accent.
 */
export function vizPalette(theme, { palette, accent } = {}) {
  if (theme === 'custom') return hueSweep(accent || '#7c5cff')
  if (THEMES[theme]) return THEMES[theme]
  const pal = (palette || []).filter(Boolean)
  if (!pal.length) return THEMES.aurora
  const vivid = pal
    .map((hex) => ({ hex, s: rgbToHsl(hexToRgb(hex))[1], l: rgbToHsl(hexToRgb(hex))[2] }))
    .filter((c) => c.l > 0.12 && c.l < 0.95)
  if (!vivid.length || vivid.every((c) => c.s < 0.18)) {
    const [h] = rgbToHsl(hexToRgb(pal[0]))
    return [0.92, 0.82, 0.72].map((l) => rgbToHex(hslToRgb([h, 0.18, l])))
  }
  const top = vivid.sort((a, b) => b.s - a.s).slice(0, 3)
  // lift dark picks so they read as light on a desktop
  const lifted = top.map((c) => {
    const [h, s, l] = rgbToHsl(hexToRgb(c.hex))
    return rgbToHex(hslToRgb([h, Math.max(s, 0.5), Math.max(l, 0.55)]))
  })
  while (lifted.length < 3) lifted.push(hueSweep(lifted[0])[lifted.length])
  return lifted
}

export const VIZ_STYLES = ['bars', 'mirror', 'blocks', 'ring', 'waveform', 'aurora']

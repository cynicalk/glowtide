// Colour: palette extraction from cover art and the user's adjustments.

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const f =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}

export function rgbToHex([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

export function rgbToHsl([r, g, b]) {
  r /= 255
  g /= 255
  b /= 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  if (!d) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = l - c / 2
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]
}

/** Hue 0..360, saturation and value 0..1: what a colour wheel and its brightness slider pick. */
export function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const mx = Math.max(r, g, b)
  const d = mx - Math.min(r, g, b)
  let h = 0
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, mx ? d / mx : 0, mx]
}

export function hsvToHex([h, s, v]) {
  const f = (n) => {
    const k = (n + (((h % 360) + 360) % 360) / 60) % 6
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255
  }
  return rgbToHex([f(5), f(3), f(1)])
}

/** WCAG relative luminance, 0..1. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Shift brightness (-100..100, lightness points) and saturation (-100..100, percent of current). */
export function adjust(hex, { brightness = 0, saturation = 0 } = {}) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  const s2 = Math.min(1, Math.max(0, s * (1 + saturation / 100)))
  const l2 = Math.min(0.97, Math.max(0.03, l + brightness / 100))
  return rgbToHex(hslToRgb([h, s2, l2]))
}

/**
 * Lift lightness until the colour reads on a dark background:
 * contrast against black >= 4.5 means luminance >= 0.175.
 */
export function readableOnDark(hex, minLum = 0.18) {
  if (luminance(hex) >= minLum) return hex
  const [h, s] = rgbToHsl(hexToRgb(hex))
  let l = rgbToHsl(hexToRgb(hex))[2]
  let out = hex
  while (l < 0.97 && luminance(out) < minLum) {
    l += 0.02
    out = rgbToHex(hslToRgb([h, s, l]))
  }
  return out
}

/** Dark or light text for a filled block of this colour. */
export function textOn(hex) {
  return luminance(hex) > 0.35 ? '#17110d' : '#fbf6f0'
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * Up to n dominant, visually distinct colours from raw pixels.
 * pixels: Uint8Array in BGRA order (Electron nativeImage.toBitmap on Windows) or RGBA.
 * Scores favour colour that is both common and saturated, so a cover that is
 * 70% black still yields its accent colours rather than five near-blacks.
 */
export function extractPalette(pixels, { n = 5, order = 'bgra' } = {}) {
  const buckets = new Map()
  const [ri, gi, bi] = order === 'bgra' ? [2, 1, 0] : [0, 1, 2]
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const r = pixels[i + ri]
    const g = pixels[i + gi]
    const b = pixels[i + bi]
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const e = buckets.get(key)
    if (e) {
      e.c++
      e.r += r
      e.g += g
      e.b += b
    } else buckets.set(key, { c: 1, r, g, b })
  }
  const cands = [...buckets.values()].map((e) => {
    const rgb = [e.r / e.c, e.g / e.c, e.b / e.c]
    const [, s, l] = rgbToHsl(rgb)
    const vivid = s * (1 - Math.abs(l - 0.5) * 1.6)
    const extreme = l < 0.12 || l > 0.93 ? 0.08 : 1
    return { rgb, score: e.c * (0.15 + Math.max(0, vivid)) * extreme }
  })
  cands.sort((a, b) => b.score - a.score)
  const picked = []
  for (const minD of [72, 48, 28, 12]) {
    for (const cnd of cands) {
      if (picked.length >= n) break
      if (picked.every((p) => dist(p, cnd.rgb) >= minD)) picked.push(cnd.rgb)
    }
    if (picked.length >= n) break
  }
  if (!picked.length) picked.push([128, 128, 128])
  // Too few distinct colours (a flat cover): pad with lighter and darker shades of the first.
  while (picked.length < n) {
    const [h, s, l] = rgbToHsl(picked[0])
    const k = picked.length
    picked.push(
      hslToRgb([h, s, Math.min(0.92, Math.max(0.08, l + (k % 2 ? 0.22 : -0.2) * Math.ceil(k / 2)))])
    )
  }
  return picked.map(rgbToHex)
}

export const DEFAULT_PALETTE = ['#e07a3a', '#f1d9a8', '#e0a040', '#6b2e17', '#2a1a12']

/**
 * Turn palette + colour settings into the three colours the app paints with.
 * settings: { source: 'album'|'custom', glow, glow2, lyrics, highlight (swatch indexes),
 *             brightness, saturation, custom, custom2 (hex) }
 * glow2 is the second colour of a two-colour edge glow.
 */
/** A colour from settings, as #rrggbb, or the fallback: settings.json is edited by hand too. */
export const safeHex = (v, fallback) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback

export function resolveColours(palette, settings) {
  const pal = (palette?.length ? palette : DEFAULT_PALETTE).map((c) => safeHex(c, '#808080'))
  const pick = (i) => pal[Math.min(pal.length - 1, Math.max(0, i ?? 0))]
  const adj = { brightness: settings.brightness ?? 0, saturation: settings.saturation ?? 0 }
  let glow, glow2, lyrics, highlight, secondary
  if (settings.source === 'custom') {
    glow = adjust(safeHex(settings.custom, '#5fb4ff'), adj)
    glow2 = adjust(safeHex(settings.custom2, '#ff5fa2'), adj)
    highlight = glow
    lyrics = adjust('#f3ece6', { brightness: adj.brightness })
    secondary = adjust('#b9b2bb', { brightness: adj.brightness })
  } else {
    glow = adjust(pick(settings.glow), adj)
    glow2 = adjust(pick(settings.glow2 ?? 2), adj)
    lyrics = adjust(pick(settings.lyrics), adj)
    highlight = adjust(pick(settings.highlight), adj)
    // Secondary text: words already sung, constellation labels and lines.
    secondary = adjust(pick(settings.secondary ?? settings.lyrics), adj)
  }
  glow = readableOnDark(glow, 0.08)
  glow2 = readableOnDark(glow2, 0.08)
  lyrics = readableOnDark(lyrics)
  highlight = readableOnDark(highlight, 0.12)
  secondary = readableOnDark(secondary, 0.14)
  // your own lyric colours, exactly as chosen (Settings → Colours → Lyric colours)
  if (settings.lyricsOwn) {
    lyrics = safeHex(settings.sung, lyrics)
    secondary = safeHex(settings.unsung, secondary)
    highlight = safeHex(settings.next, highlight)
  }
  return { glow, glow2, lyrics, highlight, secondary, highlightText: textOn(highlight) }
}

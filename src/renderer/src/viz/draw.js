// Canvas renderers for the six visualizer styles.
// Each draws one frame from: bands (smoothed 0..1), wave (time-domain bytes), pulse,
// energy, time t (s), into ctx at w x h (device pixels), in a 3-stop palette.

const rgb = (hex) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`

/** Colour at position 0..1 along the three-stop palette. */
function along(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * 2
  return x <= 1 ? mix(stops[0], stops[1], x) : mix(stops[1], stops[2], x - 1)
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function bars(ctx, s, w, h, stops, o) {
  const n = s.bands.length
  const base = h * 0.74
  const slot = w / n
  const bw = Math.max(2, slot * 0.62)
  for (let i = 0; i < n; i++) {
    const v = s.bands[i]
    const bh = Math.max(o.dpr * 2, v * base * 0.96)
    const x = i * slot + (slot - bw) / 2
    const c = along(stops, i / (n - 1))
    ctx.fillStyle = css(c)
    roundRect(ctx, x, base - bh, bw, bh, bw / 2)
    ctx.fill()
    // reflection, fading out below the baseline
    const g = ctx.createLinearGradient(0, base, 0, base + bh * 0.45)
    g.addColorStop(0, css(c, 0.28))
    g.addColorStop(1, css(c, 0))
    ctx.fillStyle = g
    ctx.fillRect(x, base + o.dpr * 3, bw, bh * 0.45)
  }
}

function mirror(ctx, s, w, h, stops, o) {
  const n = s.bands.length
  const mid = h / 2
  const slot = w / n
  const bw = Math.max(2, slot * 0.55)
  for (let i = 0; i < n; i++) {
    // fold the spectrum so bass sits in the middle and both sides mirror it
    const k = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)
    const v = s.bands[Math.floor(k * (n - 1))]
    const bh = Math.max(o.dpr * 2, v * mid * 0.92)
    const x = i * slot + (slot - bw) / 2
    ctx.fillStyle = css(along(stops, k))
    roundRect(ctx, x, mid - bh, bw, bh * 2, bw / 2)
    ctx.fill()
  }
}

function blocks(ctx, s, w, h, stops, o) {
  const n = s.bands.length
  const rows = 16
  const slot = w / n
  const bw = Math.max(2, slot * 0.7)
  const gap = Math.max(1, o.dpr * 2)
  const bh = (h * 0.92) / rows - gap
  s.peaks ||= new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const v = s.bands[i]
    const lit = Math.round(v * rows)
    const x = i * slot + (slot - bw) / 2
    for (let r = 0; r < rows; r++) {
      const y = h - (r + 1) * (bh + gap)
      ctx.fillStyle = r < lit ? css(along(stops, r / (rows - 1))) : css(stops[0], 0.06)
      roundRect(ctx, x, y, bw, bh, Math.min(3 * o.dpr, bh / 3))
      ctx.fill()
    }
    // a falling peak cap
    s.peaks[i] = Math.max(s.peaks[i] - 0.012, v)
    const pr = Math.min(rows - 1, Math.round(s.peaks[i] * rows))
    ctx.fillStyle = css(stops[2], 0.9)
    roundRect(ctx, x, h - (pr + 1) * (bh + gap), bw, Math.max(2, bh * 0.35), 2)
    ctx.fill()
  }
}

function ring(ctx, s, w, h, stops, o) {
  const n = s.bands.length
  const cx = w / 2
  const cy = h / 2
  const m = Math.min(w, h)
  const r0 = m * (o.ringInner || 0.23) * (1 + s.pulse * 0.06)
  const len = m * 0.24
  const turn = s.t * 0.08
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2, ((Math.PI * 2 * r0) / (n * 2)) * 0.9)
  for (let i = 0; i < n * 2; i++) {
    // both halves mirror, so the ring is symmetric
    const k = i < n ? i : n * 2 - 1 - i
    const v = s.bands[k]
    const a = (i / (n * 2)) * Math.PI * 2 + turn
    const l = Math.max(o.dpr * 3, v * len)
    ctx.strokeStyle = css(along(stops, k / (n - 1)))
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    ctx.lineTo(cx + Math.cos(a) * (r0 + l), cy + Math.sin(a) * (r0 + l))
    ctx.stroke()
  }
  ctx.strokeStyle = css(stops[1], 0.25 + s.pulse * 0.5)
  ctx.lineWidth = o.dpr * 2
  ctx.beginPath()
  ctx.arc(cx, cy, r0 * 0.92, 0, Math.PI * 2)
  ctx.stroke()
}

function waveform(ctx, s, w, h, stops, o) {
  const pts = 180
  const mid = h / 2
  const amp = h * 0.42 * (o.sensitivity || 1)
  const step = Math.max(1, Math.floor(s.wave.length / pts))
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, css(stops[0]))
  g.addColorStop(0.5, css(stops[1]))
  g.addColorStop(1, css(stops[2]))
  ctx.beginPath()
  for (let i = 0; i < pts; i++) {
    const v = (s.wave[i * step] - 128) / 128
    // taper at the ends so the line dissolves instead of stopping at the edge
    const taper = Math.sin((i / (pts - 1)) * Math.PI)
    const x = (i / (pts - 1)) * w
    const y = mid + v * amp * taper
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  }
  ctx.strokeStyle = g
  ctx.lineWidth = Math.max(2, o.dpr * (2.2 + s.energy * 2))
  ctx.lineJoin = 'round'
  ctx.stroke()
  // soft fill under the line
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  const f = ctx.createLinearGradient(0, mid, 0, h)
  f.addColorStop(0, css(stops[1], 0.18))
  f.addColorStop(1, css(stops[1], 0))
  ctx.fillStyle = f
  ctx.fill()
}

function aurora(ctx, s, w, h, stops) {
  const n = s.bands.length
  const third = Math.floor(n / 3)
  const bandAvg = (a, b) => {
    let x = 0
    for (let i = a; i < b; i++) x += s.bands[i]
    return x / Math.max(1, b - a)
  }
  const levels = [bandAvg(0, third), bandAvg(third, third * 2), bandAvg(third * 2, n)]
  ctx.globalCompositeOperation = 'lighter'
  for (let k = 0; k < 3; k++) {
    const lv = levels[k]
    const base = h * (0.62 - k * 0.08)
    const amp = h * (0.08 + lv * 0.28)
    const top = base - amp * 1.6
    ctx.beginPath()
    for (let x = 0; x <= w; x += 6) {
      const u = x / w
      const y =
        base -
        amp * (0.6 + 0.4 * Math.sin(u * 5 + s.t * (0.5 + k * 0.17) + k * 2)) -
        amp * 0.35 * Math.sin(u * 13 - s.t * (0.9 + k * 0.2))
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, top, 0, h)
    g.addColorStop(0, css(stops[k], 0))
    g.addColorStop(0.35, css(stops[k], 0.35 + lv * 0.35))
    g.addColorStop(1, css(stops[k], 0))
    ctx.fillStyle = g
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

const RENDER = { bars, mirror, blocks, ring, waveform, aurora }

/**
 * Draw one frame. palette: three hex colours. opts: { dpr, sensitivity, ringInner }.
 * The glow is not drawn here: a canvas shadow is a blur per shape (48 bars, 48 blurs a
 * frame), so the visualizer puts one drop-shadow on the whole canvas instead (glowFilter).
 */
export function drawViz(ctx, style, state, w, h, palette, opts = {}) {
  ctx.clearRect(0, 0, w, h)
  const stops = palette.map(rgb)
  ctx.save()
  ;(RENDER[style] || bars)(ctx, state, w, h, stops, { dpr: 1, ...opts })
  ctx.restore()
}

/** The CSS filter that gives the whole canvas the glow a per-shape shadow used to. */
export function glowFilter(palette) {
  return palette ? `drop-shadow(0 0 7px ${css(rgb(palette[1]), 0.8)})` : 'none'
}

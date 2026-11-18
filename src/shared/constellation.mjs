// Constellation lyric style: a verse fills a real constellation one star per word.
// The whole figure shows faintly from the start and lights up as the words are sung; when
// a verse has more words than the figure has stars, the next words start a new one.
// Pure layout in a fixed 1600x900 view; no DOM.

import { CONSTELLATIONS } from './skyCatalog.mjs'

export const VIEW = { w: 1600, h: 900 }
const BOX = { cx: 800, cy: 470, w: 920, h: 430 } // where a figure is drawn (clear of the clock)
const SECTION_GAP_MS = 5000 // a pause this long starts a new verse

export function seedOf(s) {
  let h = 2166136261
  for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export function rand(n) {
  let t = (n + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** The catalogue entry for the n-th figure of a song, never the same twice in a row. */
export function pickConstellation(seed, n) {
  const N = CONSTELLATIONS.length
  const order = Math.floor(rand(seed) * N)
  // A step coprime with N walks every figure before repeating any.
  const gcd = (x, y) => (y ? gcd(y, x % y) : x)
  const step = [7, 11, 13, 17, 19, 23].find((k) => gcd(k, N) === 1) || 1
  return CONSTELLATIONS[(order + n * step) % N]
}

/** Fit a figure's 0..1 coordinates into the drawing box, keeping its proportions. */
export function placeStars(cons) {
  const xs = cons.stars.map((s) => s[0])
  const ys = cons.stars.map((s) => s[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const w = Math.max(0.2, x1 - x0)
  const h = Math.max(0.2, y1 - y0)
  const k = Math.min(BOX.w / w, BOX.h / h)
  return cons.stars.map(([x, y, m]) => ({
    x: Math.round(BOX.cx + (x - (x0 + x1) / 2) * k),
    y: Math.round(BOX.cy + (y - (y0 + y1) / 2) * k),
    m: m || 2
  }))
}

/** Words with global index, verse number and the line they belong to. */
function flatten(lines) {
  const out = []
  let section = 0
  let lastEnd = null
  lines.forEach((l, li) => {
    if (!l.words?.length) {
      if (lastEnd !== null) section++ // a break marker in the file
      lastEnd = null
      return
    }
    if (lastEnd !== null && l.t - lastEnd > SECTION_GAP_MS) section++
    l.words.forEach((w) => out.push({ w: w.w, t: w.t, end: w.end, line: li, section }))
    lastEnd = l.end ?? l.t
  })
  return out.map((w, i) => ({ ...w, i }))
}

/**
 * Split every verse into chunks that each fill one constellation.
 * Returns [{ cons, words: [flat word], n }] in song order.
 */
export function buildFigures(lines, seed = 0) {
  const words = flatten(lines)
  const lineEnd = (k) => {
    let j = k
    while (j < words.length && words[j].line === words[k].line) j++
    return j
  }
  const figures = []
  let walk = 0
  let k = 0
  while (k < words.length) {
    const section = words[k].section
    // Whole lines stay in one figure: walk on to a constellation big enough for the next
    // line when one is near, rather than splitting the line across two skies.
    const need = lineEnd(k) - k
    let cons = pickConstellation(seed, walk++)
    for (let tries = 0; tries < 12 && cons.stars.length < need; tries++)
      cons = pickConstellation(seed, walk++)
    const size = cons.stars.length
    const chunk = []
    while (k < words.length && words[k].section === section) {
      const j = lineEnd(k)
      if (chunk.length + (j - k) <= size) {
        while (k < j) chunk.push(words[k++])
      } else {
        // A line longer than any nearby figure: fill this one and carry on in the next.
        if (!chunk.length) while (chunk.length < size) chunk.push(words[k++])
        break
      }
    }
    figures.push({ cons, words: chunk, n: figures.length })
  }
  return figures
}

/**
 * The sky at posMs.
 * mode 'words': a star lights as its word is sung; focus = that word.
 * mode 'lines': a whole line's stars light when the line starts (all a line-timed file can
 *   place); focus = that line.
 * Returns { figure, stars, edges, focus, key } or { figure: null } before the first word.
 * figure: { id, name, title, desc, n }. stars: [{ x, y, m, word, lit, current }].
 */
export function constellationAt(
  lines,
  posMs,
  { mode = 'words', seed = 0, figures, captionLine = false } = {}
) {
  const figs = figures || buildFigures(lines, seed)
  const none = { figure: null, stars: [], edges: [], focus: null, key: 'none' }
  if (!figs.length) return none

  // The last word already reached, and whether we are inside a sung stretch.
  let lastLine = -1
  let quiet = false
  let focusText = null
  if (mode === 'lines') {
    for (let i = 0; i < lines.length; i++) if (lines[i].t <= posMs) lastLine = i
    if (lastLine === -1) return none
    const line = lines[lastLine]
    if (!line.words?.length) quiet = true
    else {
      const next = lines[lastLine + 1]
      const holdUntil = Math.max((line.end ?? line.t) + 2500, line.t + 9000)
      if (posMs >= Math.min(next ? next.t : Infinity, holdUntil)) quiet = true
      focusText = line.text
    }
  }
  let figIdx = -1
  let litCount = 0
  let lastWord = null
  figs.forEach((f, fi) => {
    f.words.forEach((w, wi) => {
      const reached = mode === 'lines' ? w.line <= lastLine : w.t <= posMs
      if (reached) {
        figIdx = fi
        litCount = wi + 1
        lastWord = w
      }
    })
  })
  if (figIdx === -1) {
    // Before the first word: show the first figure unlit, so the sky is there from the start.
    if (mode === 'words' && figs[0].words[0] && posMs < figs[0].words[0].t) figIdx = 0
    else return none
  }
  if (mode === 'words' && lastWord) {
    const lineEnd = lines[lastWord.line].end ?? lastWord.end
    if (posMs > lineEnd + 900) quiet = true
    // captionLine: stars light word by word, but the caption shows the whole line, which
    // stays in sync even when the word timing is only estimated.
    focusText = captionLine ? lines[lastWord.line].text : lastWord.w
  }

  const fig = figs[figIdx]
  const placed = placeStars(fig.cons)
  const curLine = lastWord?.line
  const stars = placed.map((p, si) => {
    const w = fig.words[si]
    const lit = !!w && si < litCount
    const current = lit && !quiet && (mode === 'lines' ? w.line === curLine : si === litCount - 1)
    return { ...p, word: w ? w.w : null, line: w ? w.line : null, lit, current }
  })
  const edges = fig.cons.edges.map(([a, b]) => ({ a, b, lit: stars[a].lit && stars[b].lit }))
  // Where the focus is: the current word's star, or the latest lit star of the line.
  let fi = -1
  stars.forEach((s, si) => {
    if (s.current) fi = si
  })
  const focus = fi >= 0 && focusText ? { x: stars[fi].x, y: stars[fi].y, text: focusText } : null
  const { id, name, title, desc } = fig.cons
  return {
    figure: { id, name, title, desc, n: fig.n },
    stars,
    edges,
    focus,
    key: `${mode}|${figIdx}|${litCount}|${quiet ? 'q' : ''}|${curLine}`
  }
}

/**
 * Where each lit star's word sits. The words build the figure, so every lit word is
 * labelled, beside its own star and on the side facing away from the figure's centre, so
 * the text sits outside the shape rather than across its lines.
 *
 * Placement is stable: the centre is the whole figure's (not just what is lit so far), and
 * words are placed in the order they are sung, each avoiding every star and the words before
 * it. So a word never moves once it has appeared. A word with no free spot is left out.
 * Returns Map(starIndex -> { x, y, anchor: 'start' | 'middle' | 'end' }).
 */
export function placeLabels(stars, { fontPx = 18 } = {}) {
  const out = new Map()
  if (!stars.length) return out
  const cx = stars.reduce((a, s) => a + s.x, 0) / stars.length
  const cy = stars.reduce((a, s) => a + s.y, 0) / stars.length
  const boxes = stars.map((s) => [s.x - 8, s.y - 8, s.x + 8, s.y + 8])
  const hits = (b, own) =>
    boxes.some((o, k) => k !== own && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  const h = fontPx
  stars.forEach((s, i) => {
    if (!s.lit || !s.word) return
    const w = s.word.length * fontPx * 0.56 + 4
    let dx = s.x - cx
    let dy = s.y - cy
    const len = Math.hypot(dx, dy)
    if (len < 1) [dx, dy] = [0, -1]
    else [dx, dy] = [dx / len, dy / len]
    const side = (ux) => (ux > 0.38 ? 'start' : ux < -0.38 ? 'end' : 'middle')
    const at = (ux, uy, gap) => ({
      x: s.x + ux * gap,
      // text sits on its baseline: centre it on the star's side, above or below it
      y: s.y + uy * gap + (Math.abs(uy) > 0.7 ? (uy > 0 ? h * 0.8 : 0) : h * 0.35),
      anchor: side(ux)
    })
    // Straight outward first, near the star and then a step further; then turned a little
    // either way; then above, below and to each side.
    const turn = (deg) => {
      const r = (deg * Math.PI) / 180
      return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)]
    }
    const dirs = [
      turn(40),
      turn(-40),
      [0, -1],
      [0, 1],
      [dx >= 0 ? 1 : -1, 0],
      [dx >= 0 ? -1 : 1, 0]
    ]
    const tries = [
      at(dx, dy, 14),
      at(dx, dy, 30),
      ...[14, 30].flatMap((gap) => dirs.map(([ux, uy]) => at(ux, uy, gap)))
    ]
    for (const t of tries) {
      const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2
      const box = [x0 - 3, t.y - h * 0.85, x0 + w + 3, t.y + h * 0.25]
      if (!hits(box, i)) {
        boxes.push(box)
        out.set(i, t)
        return
      }
    }
  })
  return out
}

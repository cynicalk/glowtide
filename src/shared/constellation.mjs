// Constellation lyric style: a verse fills a real constellation one star per word.
// The whole figure shows faintly from the start and lights up as the words are sung; when
// a verse has more words than the figure has stars, the figure fills again for the rest.
// Figures are chosen to fit the verse, well-known ones first. A chorus that comes back
// returns to its own constellation.
// Pure layout in a fixed 1600x900 view; no DOM.

import { CONSTELLATIONS } from './skyCatalog.mjs'

export const VIEW = { w: 1600, h: 900 }
// where a figure is drawn: clear of the clock above and the caption below
const BOX = { cx: 800, cy: 445, w: 920, h: 400 }
const SECTION_GAP_MS = 5000 // a pause this long starts a new verse
// below this (sky units) is the caption's: no word is placed there
const CAPTION_TOP = 720

// Figures most people know by shape or by name (the zodiac): chosen first when one fits.
export const FAMOUS = new Set(
  'Ori UMa UMi Cas Cyg Sco Leo Lyr Gem Tau CMa Cru Aql Peg And Per Sgr Boo CrB Dra Aur Cen Cep Her Del Vir Aqr Ari Cap Psc Lib Cnc'.split(
    ' '
  )
)

// A star's colour from its B-V colour index: hot blue-white through white and yellow to
// cool orange-red. A little stronger than the eye sees them, so the difference shows.
const STAR_COLOURS = [
  [-0.3, [155, 178, 255]],
  [0, [202, 216, 255]],
  [0.3, [244, 244, 255]],
  [0.6, [255, 244, 228]],
  [0.9, [255, 226, 184]],
  [1.2, [255, 206, 150]],
  [1.5, [255, 182, 112]],
  [1.9, [255, 150, 84]]
]
/** CSS colour for a B-V index; white when it isn't known. */
export function starColour(bv) {
  if (!Number.isFinite(bv)) return '#ffffff'
  const t = STAR_COLOURS
  if (bv <= t[0][0]) return `rgb(${t[0][1].join(',')})`
  for (let i = 1; i < t.length; i++) {
    if (bv <= t[i][0]) {
      const k = (bv - t[i - 1][0]) / (t[i][0] - t[i - 1][0])
      const c = t[i - 1][1].map((v, j) => Math.round(v + (t[i][1][j] - v) * k))
      return `rgb(${c.join(',')})`
    }
  }
  return `rgb(${t.at(-1)[1].join(',')})`
}

/** A star's radius (sky units) from its magnitude: the brighter, the bigger. */
export function starRadius(star) {
  if (Number.isFinite(star.mag)) return Math.min(8.6, Math.max(3.4, 7.4 - 0.85 * star.mag))
  return star.m === 1 ? 6 : star.m === 2 ? 4.8 : 3.8
}

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
  return cons.stars.map(([x, y, m, mag, bv]) => ({
    x: Math.round(BOX.cx + (x - (x0 + x1) / 2) * k),
    y: Math.round(BOX.cy + (y - (y0 + y1) / 2) * k),
    m: m || 2,
    mag: mag ?? null,
    bv: bv ?? null
  }))
}

const plain = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * Where a repeated passage (a chorus) starts and ends, so it is a part of its own even when
 * the song runs straight into it: two or more lines in a row (of three words or more) that
 * come back together elsewhere. A single line that happens to repeat is not a chorus.
 */
function passageBreaks(lines) {
  const texts = lines.map((l) => (l.words?.length ? plain(l.text) : null))
  const long = (t) => !!t && t.split(' ').length >= 3
  const breaks = new Set() // a new part starts at these lines
  for (let i = 0; i < texts.length; i++) {
    if (!long(texts[i])) continue
    for (let j = i + 2; j < texts.length; j++) {
      if (texts[j] !== texts[i]) continue
      // only from where the two passages start matching, not from inside one
      if (i > 0 && texts[i - 1] === texts[j - 1]) continue
      let n = 0
      while (j + n < texts.length && texts[i + n] && texts[i + n] === texts[j + n] && i + n < j) n++
      if (n < 2) continue
      breaks
        .add(i)
        .add(j)
        .add(i + n)
        .add(j + n)
    }
  }
  return breaks
}

// A part with no pause or chorus to end it still moves on after this many lines (split
// evenly), so a song without either doesn't spend its whole length in one constellation.
const MAX_PART_LINES = 8

/** Words with global index, part (verse, chorus) number and the line they belong to. */
function flatten(lines) {
  const breaks = passageBreaks(lines)
  // the song's parts, as runs of line indexes
  const parts = []
  let cur = []
  let lastEnd = null
  lines.forEach((l, li) => {
    if (!l.words?.length) {
      if (cur.length) parts.push(cur) // a break marker in the file
      cur = []
      lastEnd = null
      return
    }
    if (cur.length && ((lastEnd !== null && l.t - lastEnd > SECTION_GAP_MS) || breaks.has(li))) {
      parts.push(cur)
      cur = []
    }
    cur.push(li)
    lastEnd = l.end ?? l.t
  })
  if (cur.length) parts.push(cur)
  const out = []
  let section = 0
  for (const part of parts) {
    const pieces = Math.ceil(part.length / MAX_PART_LINES)
    const per = Math.ceil(part.length / pieces)
    part.forEach((li, k) => {
      if (k > 0 && k % per === 0) section++
      for (const w of lines[li].words) out.push({ w: w.w, t: w.t, end: w.end, line: li, section })
    })
    section++
  }
  return out.map((w, i) => ({ ...w, i }))
}

/**
 * The figures of a song. Each part (a verse, a chorus) stays in one constellation: when it
 * has more words than the figure has stars, the figure fills again for the next lines
 * (another page of the same constellation) rather than moving on. A new constellation comes
 * only when a new part begins.
 * Returns [{ cons, words: [flat word], n, page }] in song order.
 */
export function buildFigures(lines, seed = 0) {
  const words = flatten(lines)
  // the parts, each as its lines' words: [[word, ...], ...] per line
  const parts = []
  for (const w of words) {
    const part = parts[w.section] || (parts[w.section] = [])
    const line = part.at(-1)
    if (line && line[0].line === w.line) line.push(w)
    else part.push([w])
  }
  // Pages of a figure this size: whole lines while they fit; a line longer than the figure
  // fills it and carries on in the next page.
  const paginate = (part, size) => {
    const pages = []
    let page = []
    for (const line of part) {
      if (page.length + line.length <= size) {
        page.push(...line)
        continue
      }
      if (page.length) pages.push(page)
      page = []
      for (let i = 0; i < line.length; i += size) {
        const piece = line.slice(i, i + size)
        if (piece.length === size) pages.push(piece)
        else page = piece
      }
    }
    if (page.length) pages.push(page)
    return pages
  }

  const figures = []
  const used = new Map() // id -> times used
  const sung = new Map() // a part's text -> its constellation, so a chorus comes back to it
  let prev = null
  for (const part of parts.filter(Boolean)) {
    const key = part.map((line) => plain(lines[line[0].line].text)).join('\n')
    let cons = sung.get(key)
    if (!cons) {
      const count = part.reduce((a, line) => a + line.length, 0)
      let bestScore = -Infinity
      CONSTELLATIONS.forEach((c, ci) => {
        if (prev && c.id === prev.id) return
        const pages = paginate(part, c.stars.length)
        // as few pages as possible, each as full as possible
        const fill = count / (pages.length * c.stars.length)
        let score = 2 * fill - 1.2 * (pages.length - 1)
        if (FAMOUS.has(c.id)) score += 1.2
        score -= 1.5 * (used.get(c.id) || 0)
        // a little chance, more for the first figure, so songs don't all start alike
        score += (prev ? 0.6 : 1.6) * rand(seed + figures.length * 131 + ci * 7)
        if (score > bestScore) [bestScore, cons] = [score, c]
      })
      sung.set(key, cons)
    }
    used.set(cons.id, (used.get(cons.id) || 0) + 1)
    paginate(part, cons.stars.length).forEach((page, p) =>
      figures.push({ cons, words: page, n: figures.length, page: p })
    )
    prev = cons
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
export function placeLabels(stars, { fontPx = 18, floor = CAPTION_TOP } = {}) {
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
      // never down in the caption's space
      if (!hits(box, i) && box[3] <= floor) {
        boxes.push(box)
        out.set(i, t)
        return
      }
    }
  })
  return out
}

// Lyrics: LRC parsing and estimated word timing.
//
// LRCLIB gives line-level timestamps only. Word timing here is an ESTIMATE,
// spread across each line by word length. Callers must not present it as
// measured. If a song has only plain (untimed) lyrics, we return no lines,
// because inventing timing for a whole song would be worse than showing nothing.

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
// Enhanced (A2) LRC puts per-word times inside the line: [00:12.00]<00:12.00>Hey <00:12.40>you
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g

const tagMs = (m) =>
  Number(m[1]) * 60000 + Number(m[2]) * 1000 + (m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0)

/** True when the LRC carries real per-word times. */
export function hasWordTags(lrc) {
  return typeof lrc === 'string' && /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/.test(lrc)
}

/** Parse LRC text into [{ t, text, body }] sorted by time (ms). Empty-text lines are kept: they mark gaps. */
export function parseLrc(lrc) {
  if (!lrc || typeof lrc !== 'string') return []
  let offset = 0
  const out = []
  for (const raw of lrc.split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i)
    if (off) {
      offset = Number(off[1])
      continue
    }
    const tags = [...raw.matchAll(TIME_TAG)]
    if (!tags.length) continue
    const body = raw.replace(TIME_TAG, '')
    const text = body.replace(WORD_TAG, '').replace(/\s+/g, ' ').trim()
    for (const m of tags) {
      // LRC [offset:+n] means lyrics appear n ms earlier.
      out.push({ t: Math.max(0, tagMs(m) - offset), text, body, offset })
    }
  }
  return out.sort((a, b) => a.t - b.t)
}

/**
 * Lines with MEASURED word times from enhanced LRC. A segment between two word tags
 * that holds several words (some files tag phrases, not words) is split by length
 * inside its own measured span, so no time is invented outside what the file says.
 * Lines without word tags fall back to the estimate.
 */
export function enhancedLrcLines(lrc, durationMs) {
  const base = parseLrc(lrc)
  const estimated = estimateWordTiming(base, durationMs)
  return base.map((line, i) => {
    const nextT = i + 1 < base.length ? base[i + 1].t : durationMs || line.t + 5000
    const marks = [...line.body.matchAll(WORD_TAG)]
    if (!marks.length) return estimated[i]
    const segs = []
    marks.forEach((m, k) => {
      const from = m.index + m[0].length
      const to = k + 1 < marks.length ? marks[k + 1].index : line.body.length
      segs.push({ t: Math.max(0, tagMs(m) - line.offset), text: line.body.slice(from, to) })
    })
    const words = []
    segs.forEach((s, k) => {
      const parts = s.text.split(/\s+/).filter(Boolean)
      if (!parts.length) return // a closing tag: it only marks where the previous word ends
      const end = k + 1 < segs.length ? segs[k + 1].t : Math.min(nextT, s.t + parts.length * 600)
      const span = Math.max(0, end - s.t)
      const total = parts.reduce((n, p) => n + p.length + 1, 0)
      let t = s.t
      for (const p of parts) {
        const d = (span * (p.length + 1)) / total
        words.push({ w: p, t: Math.round(t), end: Math.round(t + d) })
        t += d
      }
    })
    if (!words.length) return estimated[i]
    return { t: line.t, text: line.text, end: words[words.length - 1].end, words }
  })
}

const PER_WORD_MS = 420
const LINE_TAIL_MS = 450
const MIN_WORD_MS = 120

/**
 * Give each line a words[] array with estimated { w, t, end } in ms.
 * A line is sung for at most ~PER_WORD_MS per word, so a long instrumental
 * gap after a line is not stretched across its last word.
 */
export function estimateWordTiming(lines, durationMs) {
  return lines.map((line, i) => {
    const words = line.text.split(/\s+/).filter(Boolean)
    // An unknown duration (0) must not squash the last line: assume a few seconds.
    const nextT = i + 1 < lines.length ? lines[i + 1].t : durationMs || line.t + 5000
    const available = Math.max(0, nextT - line.t)
    if (!words.length) return { ...line, end: line.t, words: [] }
    const sung = Math.min(
      Math.max(available - 80, MIN_WORD_MS),
      words.length * PER_WORD_MS + LINE_TAIL_MS
    )
    const weights = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2)
    const total = weights.reduce((a, b) => a + b, 0)
    let t = line.t
    const timed = words.map((w, j) => {
      const d = (sung * weights[j]) / total
      const item = { w, t: Math.round(t), end: Math.round(t + d) }
      t += d
      return item
    })
    return { ...line, end: Math.round(line.t + sung), words: timed }
  })
}

/**
 * The three-word window the kinetic view shows at position posMs:
 * prev (just sung), cur (being sung), next (coming up). null where none.
 * Between lines (in a gap), cur is null so the overlay can go quiet.
 */
export function wordWindowAt(lines, posMs) {
  const flat = []
  lines.forEach((l, li) => l.words.forEach((w) => flat.push({ ...w, line: li })))
  if (!flat.length) return { prev: null, cur: null, next: null, index: -1 }
  let lo = 0
  let hi = flat.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (flat[mid].t <= posMs) {
      idx = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (idx === -1) return { prev: null, cur: null, next: flat[0], index: -1 }
  const w = flat[idx]
  const lineEnd = lines[w.line].end
  // Past the end of the sung part of this line: a gap. Hold the last word briefly, then clear.
  if (posMs > lineEnd + 900)
    return { prev: null, cur: null, next: flat[idx + 1] ?? null, index: -1 }
  return { prev: flat[idx - 1] ?? null, cur: w, next: flat[idx + 1] ?? null, index: idx }
}

/** Current line index for the in-window lyric list. -1 before the first line. */
export function lineIndexAt(lines, posMs) {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= posMs) idx = i
    else break
  }
  return idx
}

// Lyrics: LRC parsing and estimated word timing.
//
// LRCLIB gives line-level timestamps only. Word timing here is an ESTIMATE,
// spread across each line by word length. Callers must not present it as
// measured. If a song has only plain (untimed) lyrics, we return no lines,
// because inventing timing for a whole song would be worse than showing nothing.

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** Parse LRC text into [{ t, text }] sorted by time (ms). Empty-text lines are kept: they mark gaps. */
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
    const text = raw.replace(TIME_TAG, '').trim()
    for (const m of tags) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0
      const t = Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac
      // LRC [offset:+n] means lyrics appear n ms earlier.
      out.push({ t: Math.max(0, t - offset), text })
    }
  }
  return out.sort((a, b) => a.t - b.t)
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

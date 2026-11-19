// Lyrics: LRC parsing and estimated word timing.
//
// LRCLIB gives line-level timestamps only. Word timing here is an ESTIMATE,
// spread across each line by word length. Callers must not present it as
// measured. If a song has only plain (untimed) lyrics, they come as plainLines() with no
// times at all: shown to read along, never timed, because inventing timing for a whole
// song would be worse than showing nothing.

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

const RELAXED_WORD_MS = 700
const RELAXED_LINE_MS = 1200
const MIN_WORD_MS = 120

/**
 * Give each line a words[] array with ESTIMATED { w, t, end } in ms.
 * The line fills most of the time until the next one; a much longer gap is treated as an
 * instrumental break and not stretched across the last word.
 */
export function estimateWordTiming(lines, durationMs) {
  return lines.map((line, i) => {
    const words = line.text.split(/\s+/).filter(Boolean)
    // An unknown duration (0) must not squash the last line: assume a few seconds.
    const nextT = i + 1 < lines.length ? lines[i + 1].t : durationMs || line.t + 5000
    const available = Math.max(0, nextT - line.t)
    if (!words.length) return { ...line, end: line.t, words: [] }
    // A sung line normally fills most of the time until the next one: singers stretch and
    // rush, and a fixed per-word pace raced through slow songs and then sat blank. Only a
    // gap far longer than the words could need is taken as an instrumental break after it.
    const relaxed = words.length * RELAXED_WORD_MS + RELAXED_LINE_MS
    const sung = Math.max(
      MIN_WORD_MS,
      available <= relaxed * 2.2 ? available - Math.min(600, available * 0.12) : relaxed
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

const LINE_HOLD_MS = 2500
const LINE_MIN_SHOW_MS = 9000

/**
 * The line window for line-timed lyrics: prev / cur / next LINES at posMs.
 * Uses only what the file states (when each line starts), so it is exact at its own grain.
 * The current line stays up until the next one starts, unless the gap is an instrumental
 * break, when it clears a little after the line's own (estimated) end.
 */
export function lineWindowAt(lines, posMs) {
  const sung = lines.filter((l) => l.text && l.text.trim())
  if (!sung.length) return { prev: null, cur: null, next: null, index: -1 }
  let idx = -1
  for (let i = 0; i < sung.length; i++) {
    if (sung[i].t <= posMs) idx = i
    else break
  }
  if (idx === -1) return { prev: null, cur: null, next: sung[0], index: -1 }
  const cur = sung[idx]
  // A gap marker (an empty LRC line) also ends the current line.
  const all = lines.indexOf(cur)
  const nextAny = lines[all + 1]
  // Keep a line up for a while even if its words are short; only a real break clears it.
  const stop = Math.min(
    nextAny ? nextAny.t : Infinity,
    Math.max((cur.end ?? cur.t) + LINE_HOLD_MS, cur.t + LINE_MIN_SHOW_MS)
  )
  const next = sung[idx + 1] ?? null
  if (posMs >= stop) return { prev: null, cur: null, next, index: -1 }
  return { prev: sung[idx - 1] ?? null, cur, next, index: idx }
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

/**
 * The current line with each word marked, for styles that show a whole line at once.
 * words mode: a word is lit once its (measured or estimated) time is reached.
 * lines mode: the whole line is lit; the file only says when the line starts.
 */
export function lineWordsAt(lines, posMs, mode = 'lines') {
  const w = lineWindowAt(lines, posMs)
  if (!w.cur) {
    return { words: null, prev: null, next: w.next?.text ?? null, key: `none|${w.next?.t}` }
  }
  let lit = 0
  const words = w.cur.words.map((x) => {
    const on = mode === 'lines' || x.t <= posMs
    if (on) lit++
    return { w: x.w, lit: on, current: false }
  })
  if (mode === 'words' && lit > 0) words[lit - 1].current = true
  return {
    words,
    prev: w.prev?.text ?? null,
    next: w.next?.text ?? null,
    t: w.cur.t,
    key: `${w.index}|${lit}`
  }
}

/**
 * Karaoke: the line being sung with each word's timing (for the colour sweep), the next
 * line, and a countdown (3, 2, 1) in the last seconds before a line that follows a long
 * break, so the singer knows when to come in.
 */
export function karaokeAt(lines, posMs, { countFromMs = 3000, breakMs = 4000 } = {}) {
  const w = lineWindowAt(lines, posMs)
  const sung = lines.filter((l) => l.text && l.text.trim())
  if (w.cur) {
    return {
      line: { t: w.cur.t, words: w.cur.words.map((x) => ({ w: x.w, t: x.t, end: x.end })) },
      next: w.next?.text ?? null,
      countdown: 0,
      key: `l${w.cur.t}`
    }
  }
  // In a break: count in to the next line if it is close and the break was long.
  const next = w.next
  let countdown = 0
  if (next) {
    const prevSung = [...sung].reverse().find((l) => l.t < next.t)
    const gap = prevSung ? next.t - (prevSung.end ?? prevSung.t) : next.t
    const left = next.t - posMs
    if (gap >= breakMs && left > 0 && left <= countFromMs) countdown = Math.ceil(left / 1000)
  }
  return { line: null, next: next?.text ?? null, countdown, key: `c${next?.t}|${countdown}` }
}

/**
 * Untimed lyrics as lines: [{ text }] with no times, so nothing that needs timing can
 * mistake them for synced ones. Blank lines between verses become one '' (a gap); none at
 * the start or end.
 */
export function plainLines(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const t = raw.trim()
    if (t || (out.length && out.at(-1).text)) out.push({ text: t })
  }
  while (out.length && !out.at(-1).text) out.pop()
  return out
}

// TTML word-timed lyrics (the Apple Music / AMLL format) -> Glowtide's line/word shape.
// Pure, no I/O, no DOM: a small tolerant tokenizer, because the main process has no
// DOMParser and the format we need is narrow.
//
// <p begin end>  one line
// <span begin end>syl</span>  one syllable; syllables touching with no whitespace
//                             between them belong to the same word
// <span ttm:role="x-translation|x-roman">  skipped
// <span ttm:role="x-bg">  background vocals: kept out of the main line (they overlap
//                         the lead in time, which a one-word-at-a-time view can't show)

/** "27.173", "3:14.571", "1:02:03.5", "12.5s", "450ms" -> ms. NaN when unreadable. */
export function ttmlTime(v) {
  if (v == null) return NaN
  const s = String(v).trim()
  let m
  if ((m = s.match(/^(\d+(?:\.\d+)?)ms$/))) return Math.round(Number(m[1]))
  if ((m = s.match(/^(\d+(?:\.\d+)?)s$/))) return Math.round(Number(m[1]) * 1000)
  const parts = s.split(':')
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN
  let total = 0
  for (const p of parts) total = total * 60 + Number(p)
  return Math.round(total * 1000)
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decode(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      )
    return ENT[e.toLowerCase()] ?? all
  })
}

function attrs(src) {
  const out = {}
  for (const m of src.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = m[3] ?? m[4]
  return out
}

const SKIP_ROLES = new Set(['x-translation', 'x-roman', 'x-romanization', 'x-bg'])

/**
 * { lines, durationMs, meta } where lines = [{ t, end, text, words: [{ w, t, end }] }].
 * Lines without any timed syllable are dropped. Words are in time order.
 */
export function parseTtml(xml) {
  const meta = {}
  const lines = []
  let durationMs = 0
  if (!xml || typeof xml !== 'string') return { lines, durationMs, meta }

  let line = null // { t, end, syls: [{ text, t, end, breakBefore }] }
  let skipDepth = 0 // inside a skipped span (translation, background vocals)
  const spanStack = [] // per open span: { timed, skip }
  let pendingBreak = false
  let cur = null // the timed syllable currently being filled

  const re =
    /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g
  for (const m of xml.matchAll(re)) {
    const [, close, name, attrSrc, selfClose, text] = m
    if (text !== undefined) {
      if (!line || skipDepth) continue
      const t = decode(text)
      if (cur) {
        // Whitespace inside a syllable's own text marks the end of a word after it.
        cur.text += t
      } else if (/\s/.test(t)) {
        pendingBreak = true
      }
      continue
    }
    if (!name) continue
    const tag = name.replace(/^.*:/, '').toLowerCase()
    const a = attrSrc ? attrs(attrSrc) : {}

    if (!close && tag === 'meta' && a.key) meta[a.key] = a.value
    if (!close && tag === 'body' && a.dur) durationMs = ttmlTime(a.dur) || 0

    if (tag === 'p') {
      if (!close && !selfClose) {
        line = { t: ttmlTime(a.begin), end: ttmlTime(a.end), syls: [] }
        pendingBreak = false
        cur = null
        skipDepth = 0
        spanStack.length = 0
      } else if (close && line) {
        finishLine(line, lines)
        line = null
      }
      continue
    }

    if (tag === 'span' && line) {
      if (!close && !selfClose) {
        const role = a['ttm:role'] || a.role
        const skip = !!role && SKIP_ROLES.has(role)
        const begin = ttmlTime(a.begin)
        const timed = !skip && !skipDepth && Number.isFinite(begin)
        if (skip) skipDepth++
        if (timed) {
          cur = { text: '', t: begin, end: ttmlTime(a.end), breakBefore: pendingBreak }
          pendingBreak = false
        }
        spanStack.push({ timed, skip })
      } else if (close) {
        const s = spanStack.pop()
        if (!s) continue
        if (s.skip) skipDepth--
        if (s.timed && cur) {
          const raw = cur.text
          if (raw.trim()) {
            cur.breakBefore = cur.breakBefore || /^\s/.test(raw)
            cur.text = raw.trim()
            line.syls.push(cur)
          }
          if (/\s$/.test(raw)) pendingBreak = true
          cur = null
        }
      }
    }
  }
  if (!durationMs && lines.length) durationMs = lines[lines.length - 1].end
  lines.sort((a, b) => a.t - b.t)
  return { lines, durationMs, meta }
}

function finishLine(line, out) {
  if (!line.syls.length) return
  const words = []
  for (const s of line.syls) {
    const prev = words[words.length - 1]
    if (prev && !s.breakBefore) {
      prev.w += s.text
      prev.end = Math.max(prev.end, Number.isFinite(s.end) ? s.end : s.t)
    } else {
      words.push({ w: s.text, t: s.t, end: Number.isFinite(s.end) ? s.end : s.t })
    }
  }
  words.sort((a, b) => a.t - b.t)
  const t = Number.isFinite(line.t) ? line.t : words[0].t
  const end = Number.isFinite(line.end) ? line.end : words[words.length - 1].end
  out.push({ t, end, text: words.map((w) => w.w).join(' '), words })
}

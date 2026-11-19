// Messages lyric style: each sung line is a text message. The bubble fills word by word as
// the line is sung; lines alternate sides (a dark bubble on the left, then a blue one on
// the right); the last few stay on screen, the older ones rising and fading away.
// Pure: no DOM.

export const SHOWN = 3 // the line being sung and the two before it
const QUIET_MS = 4000 // this long after a line ends with nothing coming, the messages clear
const SOON_MS = 1200 // ...unless the next line is about to start

/**
 * The song's messages: [{ i, t, end, text, words, from }]. words are the line's own words
 * (split from its text) each with the time it is sung; from is 'them' for the first line,
 * then alternates with 'me'.
 */
export function buildThread(lines) {
  const out = []
  ;(lines || []).forEach((l, i) => {
    const text = String(l?.text || '').trim()
    if (!text) return
    const words = text.split(/\s+/)
    // Timed words (measured or estimated) can be split differently from the text (a
    // syllable, a phrase): spread their times over the text's own words by position.
    const timed = (l.words || []).filter((w) => Number.isFinite(w?.t))
    const times = words.map((_, k) =>
      timed.length
        ? timed[Math.min(timed.length - 1, Math.floor((k * timed.length) / words.length))].t
        : l.t
    )
    const end = l.end ?? (timed.at(-1)?.end || l.t + 1500)
    out.push({
      i,
      t: l.t,
      end,
      text,
      words: words.map((w, k) => ({ w, t: Math.max(l.t, times[k]) })),
      from: out.length % 2 ? 'me' : 'them'
    })
  })
  return out
}

/**
 * The messages at posMs: the line being sung (only the words reached so far) and the two
 * before it (whole). age 0 is the newest. Returns { items, index, key }.
 * items: [{ i, from, words: [string], age, first }] oldest first; first marks the song's
 * first line (it carries the song's details beneath it).
 */
export function messagesAt(thread, posMs) {
  let idx = -1
  for (let k = 0; k < thread.length; k++) {
    if (thread[k].t <= posMs) idx = k
    else break
  }
  if (idx < 0) return { items: [], index: -1, key: 'none' }
  const cur = thread[idx]
  const next = thread[idx + 1]
  if (posMs > cur.end + QUIET_MS && (!next || next.t - posMs > SOON_MS))
    return { items: [], index: idx, key: `quiet|${idx}` }
  const reached = Math.max(1, cur.words.filter((w) => w.t <= posMs).length)
  const items = []
  for (let k = Math.max(0, idx - SHOWN + 1); k <= idx; k++) {
    const m = thread[k]
    items.push({
      i: m.i,
      from: m.from,
      words: (k === idx ? m.words.slice(0, reached) : m.words).map((w) => w.w),
      age: idx - k,
      first: k === 0
    })
  }
  return { items, index: idx, key: `${idx}|${reached}` }
}

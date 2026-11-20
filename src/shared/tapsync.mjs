// Tap-to-sync: you time a song's untimed lyrics yourself by tapping as each line starts.
// Pure: the taps are kept as a list of times, one per line with words (blank lines between
// verses are skipped), and saved as an ordinary LRC file.

const MIN_GAP_MS = 80 // two taps closer than this are one tap (a key bounce)

/** The lines that get a tap: the ones with words. [{ text }] → indexes into lines. */
export function tapTargets(lines) {
  const out = []
  ;(lines || []).forEach((l, i) => String(l?.text || '').trim() && out.push(i))
  return out
}

/**
 * One more tap at posMs. A tap at or before the previous one (a key bounce, or the song
 * seeked back) is ignored, so the times only run forward; nothing past the last line.
 */
export function tap(times, posMs, total) {
  if (times.length >= total || !Number.isFinite(posMs)) return times
  const prev = times.at(-1)
  if (prev !== undefined && posMs - prev < MIN_GAP_MS) return times
  return [...times, Math.max(0, Math.round(posMs))]
}

/** The last tap taken back. */
export const undoTap = (times) => times.slice(0, -1)

/** [mm:ss.xx] for a time in ms. */
export function lrcTag(ms) {
  const cs = Math.max(0, Math.round(ms / 10))
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}]`
}

const clean = (v) =>
  String(v ?? '')
    .replace(/[\r\n<>]+/g, ' ')
    .trim()

const meta = (v) =>
  String(v || '')
    .replace(/[[\]\r\n]/g, ' ')
    .trim()

/** <mm:ss.xx> for a word's time in ms (enhanced LRC). */
export const wordTag = (ms) => `<${lrcTag(ms).slice(1, -1)}>`

/**
 * The timed lines ([{ t, text, words? }]) as an LRC file, with the song's title and artist.
 * A line with words ([{ t, w }], one per word of its text) gets each word's time as well
 * (enhanced LRC: [00:12.00]<00:12.00>Hey <00:12.40>you), which Glowtide reads back as
 * measured word timing.
 */
export function toLrc(timed, { title, artist } = {}) {
  const head = []
  if (meta(title)) head.push(`[ti:${meta(title)}]`)
  if (meta(artist)) head.push(`[ar:${meta(artist)}]`)
  head.push('[re:Glowtide tap-to-sync]')
  const body = [...timed]
    .sort((a, b) => a.t - b.t)
    .map((l) =>
      Array.isArray(l.words) && l.words.length
        ? `${lrcTag(l.t)}${l.words.map((w) => `${wordTag(w.t)}${clean(w.w)}`).join(' ')}`
        : `${lrcTag(l.t)}${clean(l.text)}`
    )
  return [...head, ...body].join('\n') + '\n'
}

/** The taps paired with their lines: [{ t, text }]. */
export function timedLines(lines, times) {
  const targets = tapTargets(lines)
  return times.map((t, k) => ({ t, text: lines[targets[k]].text.trim() }))
}

/**
 * Word-by-word: every word of every line with words, in order, to tap one by one.
 * [{ li, wi, w }] — li indexes lines, wi the word within its line.
 */
export function wordTargets(lines) {
  const out = []
  ;(lines || []).forEach((l, li) =>
    String(l?.text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w, wi) => out.push({ li, wi, w }))
  )
  return out
}

/**
 * The lines with the words tapped so far: a line whose every word has a time gets those
 * times (and starts at its first word); the rest keep the line time they had. lines: the
 * song's timed lines [{ t, text }]; times: one per word target, in order.
 */
export function wordTimedLines(lines, times) {
  const targets = wordTargets(lines)
  const byLine = new Map()
  targets.forEach((tg, k) => {
    if (k >= times.length) return
    if (!byLine.has(tg.li)) byLine.set(tg.li, [])
    byLine.get(tg.li).push({ t: times[k], w: tg.w })
  })
  const out = []
  let last = -Infinity
  lines.forEach((l, li) => {
    const text = String(l?.text || '').trim()
    if (!text || !Number.isFinite(l.t)) return
    const n = text.split(/\s+/).filter(Boolean).length
    const words = byLine.get(li)
    if (words && words.length === n) {
      out.push({ t: words[0].t, text, words })
      last = words.at(-1).t
    } else {
      // a line after words tapped late keeps its place: never before the line above it
      const t = Math.max(l.t, last + 10)
      out.push({ t, text })
      last = t
    }
  })
  return out
}

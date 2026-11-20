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

const meta = (v) =>
  String(v || '')
    .replace(/[[\]\r\n]/g, ' ')
    .trim()

/** The timed lines ([{ t, text }]) as an LRC file, with the song's title and artist. */
export function toLrc(timed, { title, artist } = {}) {
  const head = []
  if (meta(title)) head.push(`[ti:${meta(title)}]`)
  if (meta(artist)) head.push(`[ar:${meta(artist)}]`)
  head.push('[re:Glowtide tap-to-sync]')
  const body = [...timed]
    .sort((a, b) => a.t - b.t)
    .map(
      (l) =>
        `${lrcTag(l.t)}${String(l.text)
          .replace(/[\r\n]+/g, ' ')
          .trim()}`
    )
  return [...head, ...body].join('\n') + '\n'
}

/** The taps paired with their lines: [{ t, text }]. */
export function timedLines(lines, times) {
  const targets = tapTargets(lines)
  return times.map((t, k) => ({ t, text: lines[targets[k]].text.trim() }))
}

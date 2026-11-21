// Auto lyric timing check: are the lyrics early or late against the singing? While a song
// plays, the glow window measures how sharply the vocal range of the sound rises (onsets),
// at song positions. Lines usually start as a voice comes in, so the delay that lines the
// line starts up best with those rises is the file's error. Pure: no audio here.
//
// It only speaks up when it's sure: enough lines heard, a clear best delay that stands well
// above the others, and a real difference from the nudge you already have.

export const LAG_RANGE_MS = 2000
const STEP_MS = 50
const MIN_LINES = 8

/**
 * samples: [{ t: song position ms, v: onset strength >= 0 }], in time order.
 * starts: line start times (ms, as in the lyrics file).
 * Returns { offsetMs, confidence, lines } where offsetMs is the nudge that fits best (the
 * same sense as Glowtide's lyric nudge), or null when it can't tell.
 */
export function estimateOffset(samples, starts) {
  if (!samples?.length || !starts?.length) return null
  const t0 = samples[0].t
  const t1 = samples[samples.length - 1].t
  // only lines whose whole search window was heard
  const lines = starts.filter((s) => s - LAG_RANGE_MS - 200 >= t0 && s + LAG_RANGE_MS + 200 <= t1)
  if (lines.length < MIN_LINES) return null
  // normalise: onset strength over its median, so loud and quiet songs compare
  const sorted = samples.map((s) => s.v).sort((a, b) => a - b)
  const median = sorted[sorted.length >> 1] || 1e-6
  const v = samples.map((s) => s.v / Math.max(1e-6, median))
  const ts = samples.map((s) => s.t)
  // the strongest onset in [a, b], by binary search on time
  const peak = (a, b) => {
    let lo = 0
    let hi = ts.length
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (ts[m] < a) lo = m + 1
      else hi = m
    }
    let best = 0
    for (let i = lo; i < ts.length && ts[i] <= b; i++) if (v[i] > best) best = v[i]
    return best
  }
  const scores = []
  for (let lag = -LAG_RANGE_MS; lag <= LAG_RANGE_MS; lag += STEP_MS) {
    // the voice heard at line time minus the nudge (a line shows when position + nudge
    // reaches it): a short window, a little more after than before
    let sum = 0
    for (const s of lines) sum += Math.min(8, peak(s - lag - 80, s - lag + 120))
    scores.push({ lag, score: sum / lines.length })
  }
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a))
  const mean = scores.reduce((a, b) => a + b.score, 0) / scores.length
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b.score - mean) ** 2, 0) / scores.length)
  const confidence = sd > 0 ? (best.score - mean) / sd : 0
  return { offsetMs: best.lag, confidence: +confidence.toFixed(2), lines: lines.length }
}

/**
 * Whether to offer the nudge: sure enough, and far enough from the one already set.
 * Returns the suggested nudge (ms) or null.
 */
export function suggestNudge(estimate, currentOffsetMs = 0) {
  if (!estimate || estimate.confidence < 3.2 || estimate.lines < MIN_LINES) return null
  if (Math.abs(estimate.offsetMs - currentOffsetMs) < 300) return null
  return estimate.offsetMs
}

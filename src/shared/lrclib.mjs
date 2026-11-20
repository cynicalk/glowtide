// Sharing your timing to LRCLIB (lrclib.net): the pure parts. LRCLIB asks a publisher to
// prove a little work first: find a nonce so that SHA-256(prefix + nonce) is at or below a
// target, comparing bytes from the first (their reference: lrcget's challenge_solver.rs).

/** Whether a hash (bytes) is at or below the target (bytes), most significant first. */
export function meetsTarget(hash, target) {
  if (hash.length !== target.length) return false
  for (let i = 0; i < hash.length; i++) {
    if (hash[i] > target[i]) return false
    if (hash[i] < target[i]) return true
  }
  return true
}

/** A hex string as bytes. */
export function hexBytes(hex) {
  const s = String(hex || '')
  if (!/^[0-9a-f]*$/i.test(s) || s.length % 2) return null
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * What LRCLIB is sent for a song you timed: its title, artist, album and length (seconds),
 * the words untimed (plainLyrics), and the lines with their times (syncedLyrics). Word
 * times stay on this PC: LRCLIB's synced lyrics are timed by line. null when something it
 * needs is missing (it matches lyrics by all four, so a guess would mislabel them).
 */
export function publishBody(track, lines) {
  const trackName = String(track?.name || '').trim()
  const artistName = String(track?.artist || track?.artists || '')
    .split(',')[0]
    .trim()
  const albumName = String(track?.album || '').trim()
  const duration = Math.round((track?.durationMs || 0) / 1000)
  const timed = (lines || []).filter((l) => Number.isFinite(l?.t) && String(l.text || '').trim())
  if (!trackName || !artistName || !albumName || duration < 1 || !timed.length) return null
  const tag = (ms) => {
    const cs = Math.max(0, Math.round(ms / 10))
    const p = (n) => String(n).padStart(2, '0')
    return `[${p(Math.floor(cs / 6000))}:${p(Math.floor((cs % 6000) / 100))}.${p(cs % 100)}]`
  }
  const text = (l) => String(l.text).replace(/\s+/g, ' ').trim()
  return {
    trackName,
    artistName,
    albumName,
    duration,
    plainLyrics: timed.map(text).join('\n'),
    syncedLyrics: timed.map((l) => `${tag(l.t)}${text(l)}`).join('\n')
  }
}

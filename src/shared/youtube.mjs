// YouTube helpers: links, durations, and turning a video title into artist + song
// so lyrics can be looked up. Pure, no I/O.

// A bracketed group made only of these words is packaging, not part of the song name:
// "(Official Video)", "[4K Remaster]", "(Official Music Video) (HD)", "(Lyrics)".
const NOISE_WORD =
  'official|music|video|audio|lyrics?|lyric|visuali[sz]er|m/?v|hd|hq|4k|8k|remaster(?:ed)?|explicit|clean|version|\\d{4}'
const NOISE_RE = new RegExp(`\\s*[([]\\s*(?:(?:${NOISE_WORD})[\\s&,/-]*)+\\s*[)\\]]`, 'gi')

/** Strip "(Official Video)" style suffixes, "| extra" tails and feat. credits. */
export function cleanSongTitle(t) {
  return t
    .replace(NOISE_RE, '')
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s.*$/i, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s*["“”]+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * { artist, title } from a YouTube title and channel name.
 * YouTube Music "Topic" channels are the clean case: the channel is the artist.
 */
export function parseYouTubeTitle(rawTitle = '', channel = '') {
  const ch = channel.trim()
  if (/\s-\sTopic$/i.test(ch)) {
    return { artist: ch.replace(/\s-\sTopic$/i, '').trim(), title: cleanSongTitle(rawTitle) }
  }
  const m = rawTitle.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (m) return { artist: cleanSongTitle(m[1]), title: cleanSongTitle(m[2]) }
  // VEVO channels glue the artist's words together ("BandNameVEVO"); other channel
  // names are left alone, or "McFly" would become "Mc Fly".
  const artist = /VEVO$/i.test(ch)
    ? ch
        .replace(/VEVO$/i, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim()
    : ch.replace(/\s*-\s*Topic$/i, '').trim()
  return { artist: artist || ch, title: cleanSongTitle(rawTitle) }
}

const ID = /^[A-Za-z0-9_-]{11}$/

/**
 * { videoId?, playlistId? } from a YouTube or YouTube Music link, or a bare ID.
 * null when nothing usable. Auto-generated mixes (RD…) are kept: the player handles them.
 */
export function parseYouTubeLink(input) {
  const s = (input || '').trim()
  if (!s) return null
  if (ID.test(s)) return { videoId: s }
  if (/^(PL|OLAK5uy_|LL|RD|UU|FL)[A-Za-z0-9_-]{2,}$/.test(s)) return { playlistId: s }
  let u
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  if (!/^(youtube\.com|music\.youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host))
    return null
  const out = {}
  const list = u.searchParams.get('list')
  if (list && /^[A-Za-z0-9_-]+$/.test(list)) out.playlistId = list
  let v = u.searchParams.get('v')
  if (!v && host === 'youtu.be') v = u.pathname.slice(1).split('/')[0]
  if (!v) {
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/)
    if (m) v = m[1]
  }
  if (v && ID.test(v)) out.videoId = v
  return out.videoId || out.playlistId ? out : null
}

/** ISO 8601 duration (PT3M21S) to ms. 0 when unknown. */
export function isoDurationMs(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '')
  if (!m) return 0
  const [, d, h, mi, s] = m.map((x) => Number(x || 0))
  return (((d * 24 + h) * 60 + mi) * 60 + s) * 1000
}

export const YT_ERRORS = {
  2: "That link doesn't point to a playable video.",
  5: "YouTube's player couldn't play this video.",
  100: 'This video was removed or is private.',
  101: "The owner doesn't allow this video to play outside YouTube.",
  150: "The owner doesn't allow this video to play outside YouTube.",
  153: 'YouTube refused the embedded player. Restart Glowtide and try again.',
  stalled:
    "This video didn't start. Its owner probably blocks playback outside YouTube. Try another upload of the song, like its YouTube Music version."
}

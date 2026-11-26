// YouTube helpers: links, durations, and turning a video title into artist + song
// so lyrics can be looked up. Pure, no I/O.

// A bracketed group made only of these words is packaging, not part of the song name:
// "(Official Video)", "[4K Remaster]", "(Official Music Video) (HD)", "(Lyrics)".
const NOISE_WORD =
  'official|music|video|audio|lyrics?|lyric|lyrical|visuali[sz]er|m/?v|hd|hq|4k|8k|remaster(?:ed)?|explicit|clean|version|\\d{4}'
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

// A "| part" of a title that's packaging, not a name: "Official Video", "Lyrics", "4K".
const PACKAGING =
  /\b(official|video|lyrics?|lyrical|audio|full|songs?|hd|4k|8k|remaster(ed)?|visuali[sz]er|out now|latest|new|teaser|trailer|jukebox|reels?|shorts?)\b/i
// A "| part" that reads as people: letters, spaces, commas ("Pritam, Arijit Singh"), no digits.
const NAMES = /^\p{L}[\p{L}\p{M} .,'&-]*$/u
const plain = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/vevo$/, '')
    .replace(/\s*-\s*topic$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Nothing but packaging: "Official Lyric", "(Official Video) [HD]". */
const onlyPackaging = (s) =>
  !String(s || '')
    .replace(new RegExp(PACKAGING.source, 'gi'), '')
    .replace(/[^\p{L}\p{N}]+/gu, '')

/** The channel as an artist: VEVO's glued words split ("BandNameVEVO" → "Band Name"). */
function channelArtist(ch) {
  // other channel names are left alone, or "McFly" would become "Mc Fly"
  const artist = /VEVO$/i.test(ch)
    ? ch
        .replace(/VEVO$/i, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim()
    : ch.replace(/\s*-\s*Topic$/i, '').trim()
  return artist || ch
}

/**
 * From a title's "| parts", the people credited: the last three names, as film titles list
 * the cast first and the music last ("Ranbir | Alia | Pritam | Arijit Singh | Amitabh").
 */
function creditedArtist(parts, max = 3) {
  const names = parts
    .filter((p) => NAMES.test(p) && !PACKAGING.test(p) && p.split(/\s+/).length <= 12)
    .flatMap((p) => p.split(/\s*,\s*/))
    .map((n) => n.trim())
    .filter(Boolean)
  return names.slice(-max).join(', ')
}

// what film titles add after the song's name: "Full Song", "8K Full Video", "Lyrical Video"
const FILM_TAIL =
  /\s+(?:\d+k\s+)?(?:full\s+(?:song|video|audio)|lyrical(?:\s+video)?|official\s+(?:video|audio|lyric))\s*$/i
const songOf = (s) =>
  cleanSongTitle(s)
    .replace(FILM_TAIL, '')
    .replace(/^[^:]{2,40}:\s+(?=\S)/, '') // "Jawan: Chaleya", "Aashiqui 2: Tum Hi Ho"
    .trim()

/**
 * { artist, title } from a YouTube title and channel name.
 * YouTube Music "Topic" channels are the clean case: the channel is the artist. Otherwise
 * "A - B" is read two ways, as titles come:
 * - "Artist - Song" (most music worldwide), and "Song - Artist" when the channel is B;
 * - "Song - Film | Cast | Singers" (film music, as Indian labels title it): "| parts" that
 *   are names, not packaging, mean A is the song, and the singers come from those parts.
 */
export function parseYouTubeTitle(rawTitle = '', channel = '') {
  const ch = channel.trim()
  if (/\s-\sTopic$/i.test(ch)) {
    return { artist: ch.replace(/\s-\sTopic$/i, '').trim(), title: cleanSongTitle(rawTitle) }
  }
  const parts = String(rawTitle)
    .split(/\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  const head = parts[0] || String(rawTitle)
  const rest = parts.slice(1).filter((p) => !/^[@#]/.test(p))
  const credits = rest.filter((p) => !PACKAGING.test(p))
  const by = plain(ch)
  const m = head.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (m) {
    const [, a, b] = m
    // the channel is one side: that side is the artist
    if (by && plain(a) === by) return { artist: cleanSongTitle(a), title: cleanSongTitle(b) }
    if (by && plain(b) === by) return { artist: cleanSongTitle(b), title: cleanSongTitle(a) }
    // "Singer - Song | … | Singer, …": the left side is among the credits
    const named = new Set(creditedArtist(rest, 99).split(', ').map(plain).filter(Boolean))
    // or named in the channel's name ("Soulful Arijit Singh Songs")
    const inChannel = (x) => plain(x).length >= 5 && ` ${by} `.includes(` ${plain(x)} `)
    if (named.has(plain(a)) || (inChannel(a) && !inChannel(b)))
      return { artist: cleanSongTitle(a), title: songOf(b) }
    // "Song - Film | … | Singers", or "Song - Official Lyric | …": the song comes first
    if (credits.length || (onlyPackaging(b) && !onlyPackaging(a)))
      return {
        artist: creditedArtist(rest) || channelArtist(ch),
        title: songOf(a)
      }
    return { artist: cleanSongTitle(a), title: cleanSongTitle(b) }
  }
  // "Song (Lyrics) | Singer | Film": the singer from the parts
  if (credits.length) {
    // the channel's own name first ("Coke Studio | Season 14 | Pasoori | …"): the song is
    // the first name after it
    if (by && plain(head) && by.startsWith(plain(head))) {
      const i = rest.findIndex((p) => NAMES.test(p) && !PACKAGING.test(p))
      if (i >= 0)
        return {
          artist: creditedArtist(rest.slice(i + 1)) || channelArtist(ch),
          title: songOf(rest[i])
        }
    }
    const artist = creditedArtist(rest)
    if (artist) return { artist, title: songOf(head) }
  }
  return { artist: channelArtist(ch), title: cleanSongTitle(head) }
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

// YouTube Music's own search (the InnerTube API its website uses), as a backup to the official
// YouTube Data API: it needs no Google sign-in and no daily quota. Only to find songs: what's
// found plays through YouTube's official embedded player, as every YouTube song in Glowtide
// does (its ads, and its rule that the player stays on screen, included). Pure: no network.

/** Songs only (YouTube Music's "Songs" filter). */
export const SONGS_FILTER = 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'

/** The request body for a search. */
export function searchBody(query, clientVersion) {
  return {
    context: { client: { clientName: 'WEB_REMIX', clientVersion, hl: 'en' } },
    query: String(query ?? '').slice(0, 200),
    params: decodeURIComponent(SONGS_FILTER)
  }
}

const VIDEO_ID = /^[\w-]{11}$/
const runsText = (col) =>
  (col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])
    .map((r) => (typeof r?.text === 'string' ? r.text : ''))
    .join('')

/** "4:29" or "1:02:03" → ms, or 0. */
function durationMs(s) {
  const p = String(s || '')
    .trim()
    .split(':')
  if (p.length < 2 || p.length > 3 || p.some((x) => !/^\d{1,2}$/.test(x))) return 0
  return p.reduce((t, x) => t * 60 + Number(x), 0) * 1000
}

/**
 * A YouTube Music search response → songs, in the shape the official search gives
 * (youtube.js slimVideo): { id, videoId, uri, name, artists, artist, album, cover, thumb,
 * durationMs, ... }. Anything that isn't a song with a proper video id is left out.
 */
export function parseMusicSearch(json, max = 20) {
  const out = []
  const sections =
    json?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents || []
  for (const section of sections) {
    for (const item of section?.musicShelfRenderer?.contents || []) {
      const r = item?.musicResponsiveListItemRenderer
      if (!r) continue
      const videoId =
        r.playlistItemData?.videoId ||
        r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint?.videoId
      if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) continue
      const name = runsText(r.flexColumns?.[0]).trim()
      if (!name) continue
      // "Arijit Singh • Kesariya (From "Brahmastra") • 4:29"
      const parts = runsText(r.flexColumns?.[1])
        .split(' • ')
        .map((x) => x.trim())
      const last = parts[parts.length - 1]
      const ms = durationMs(last)
      const artist = parts[0] && !durationMs(parts[0]) ? parts[0] : ''
      const album = parts.length >= 3 ? parts[parts.length - 2] : ''
      out.push({
        id: `yt:${videoId}`,
        videoId,
        uri: `yt:${videoId}`,
        name: name.slice(0, 300),
        rawTitle: name.slice(0, 300),
        channel: artist,
        artists: artist,
        artist,
        album: album.slice(0, 300),
        // YouTube's own image host for every video (the page allows it; the music site's
        // album-art host it isn't)
        cover: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        thumb: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
        durationMs: ms,
        unavailable: false
      })
      if (out.length >= max) return out
    }
  }
  return out
}

// ---------- YouTube's video search ----------
// Regular YouTube (not YouTube Music) finds official videos, lyric videos and audio uploads:
// more of them play in an embedded player than YouTube Music's "song" versions do.

/** Videos only (YouTube's "Videos" filter). */
export const VIDEOS_FILTER = 'EgIQAQ%3D%3D'

/** The request body for a video search. */
export function videoSearchBody(query, clientVersion) {
  return {
    context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } },
    query: String(query ?? '').slice(0, 200),
    params: decodeURIComponent(VIDEOS_FILTER)
  }
}

const text = (t) =>
  typeof t?.simpleText === 'string'
    ? t.simpleText
    : (t?.runs || []).map((r) => (typeof r?.text === 'string' ? r.text : '')).join('')

/**
 * A YouTube video search answer → songs in the official search's shape. title(raw, channel)
 * gives { artist, title } (shared/youtube.mjs parseYouTubeTitle). Live streams and anything
 * over 15 minutes are left out: a song, not a mix.
 */
export function parseVideoSearch(json, title, max = 20) {
  const out = []
  const sections =
    json?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents || []
  for (const section of sections) {
    for (const item of section?.itemSectionRenderer?.contents || []) {
      const v = item?.videoRenderer
      const videoId = v?.videoId
      if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) continue
      const raw = text(v.title).trim()
      const ms = durationMs(text(v.lengthText))
      if (!raw || !ms || ms > 15 * 60 * 1000) continue
      const channel = text(v.ownerText).trim()
      const parsed = title(raw, channel)
      const artist = String(parsed?.artist || channel || '')
      out.push({
        id: `yt:${videoId}`,
        videoId,
        uri: `yt:${videoId}`,
        name: String(parsed?.title || raw).slice(0, 300),
        rawTitle: raw.slice(0, 300),
        channel: channel.slice(0, 200),
        artists: artist.slice(0, 200),
        artist: artist.slice(0, 200),
        album: '',
        cover: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        thumb: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
        durationMs: ms,
        unavailable: false
      })
      if (out.length >= max) return out
    }
  }
  return out
}

// ---------- another upload of a song that won't play ----------

const words = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
const LIKELY = /\b(lyric|lyrics|audio)\b/i
const UNLIKE =
  /\b(live|cover|remix|slowed|reverb|8d|nightcore|karaoke|instrumental|sped up|reaction|teaser|trailer)\b/i

/**
 * From search results, another upload of a song that wouldn't play, or null: its title has
 * the song's words, it isn't one already tried, it's about as long (if that's known), and it
 * isn't a live/cover/remix version (unless the song is). Lyric and audio uploads first: they
 * are the likeliest to play in an embedded player.
 */
export function pickAnotherUpload(results, { name, durationMs = 0, tried = [] } = {}) {
  const want = words(name)
  if (!want.length) return null
  const skip = new Set(tried)
  const songUnlike = UNLIKE.test(name || '')
  const fits = (r) => {
    if (!r?.videoId || skip.has(r.videoId)) return false
    const have = new Set(words(r.rawTitle || r.name))
    const hit = want.filter((w) => have.has(w)).length
    if (hit < Math.ceil(want.length * 0.6)) return false
    if (!songUnlike && UNLIKE.test(r.rawTitle || r.name || '')) return false
    if (durationMs && r.durationMs && Math.abs(r.durationMs - durationMs) > durationMs * 0.25)
      return false
    return true
  }
  const ok = (results || []).filter(fits)
  return ok.find((r) => LIKELY.test(r.rawTitle || r.name || '')) || ok[0] || null
}

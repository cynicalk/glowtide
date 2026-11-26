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

// ---------- albums, playlists and the songs in them ----------
// YouTube Music's search for albums and for playlists (its own filters), and the songs of any
// public playlist or album from the watch page's list (the "next" answer): no sign-in.

/** Albums only, and playlists only (YouTube Music's filters). */
export const ALBUMS_FILTER = 'EgWKAQIYAWoMEA4QChADEAQQCRAF'
export const PLAYLISTS_FILTER = 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU='

/** The request body for an album or playlist search: kind 'album' | 'playlist'. */
export function listSearchBody(query, clientVersion, kind) {
  return {
    context: { client: { clientName: 'WEB_REMIX', clientVersion, hl: 'en' } },
    query: String(query ?? '').slice(0, 200),
    params: kind === 'album' ? ALBUMS_FILTER : PLAYLISTS_FILTER
  }
}

/** The request body for a playlist's songs. */
export function playlistBody(playlistId, clientVersion) {
  return {
    context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } },
    playlistId: String(playlistId ?? '').slice(0, 64)
  }
}

export const LIST_ID = /^[\w-]{2,64}$/
const IMAGE = /^https:\/\/(i\.ytimg\.com|yt3\.ggpht\.com|(yt3|lh3)\.googleusercontent\.com)\//
/** A picture address from YouTube's own image hosts, or null. */
export const safeImage = (u) =>
  typeof u === 'string' && u.length < 1000 && IMAGE.test(u) ? u : null

/** The picture closest to 120 px wide (a row's size, sharp on a 2x screen). */
function pickImage(thumbs) {
  const list = (Array.isArray(thumbs) ? thumbs : []).filter((t) => safeImage(t?.url))
  if (!list.length) return null
  const best = list.find((t) => (t.width || 0) >= 120) || list[list.length - 1]
  return best.url
}

/**
 * An album or playlist search answer → [{ id, playlistId, kind, name, by, year, thumb }].
 * id is the playlist id that plays it (an album plays as its own playlist).
 */
export function parseListSearch(json, kind, max = 8) {
  const out = []
  const sections =
    json?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents || []
  for (const section of sections) {
    for (const item of section?.musicShelfRenderer?.contents || []) {
      const r = item?.musicResponsiveListItemRenderer
      if (!r) continue
      const play =
        r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId
      const browse = r.navigationEndpoint?.browseEndpoint?.browseId
      const playlistId =
        typeof play === 'string' && LIST_ID.test(play)
          ? play
          : typeof browse === 'string' && /^VL[\w-]{2,64}$/.test(browse)
            ? browse.slice(2)
            : null
      if (!playlistId) continue
      const name = runsText(r.flexColumns?.[0]).trim()
      if (!name) continue
      // album: "Album • The Weeknd • 2013"; playlist: "Felipe • 5.2M views"
      const parts = runsText(r.flexColumns?.[1])
        .split(' • ')
        .map((x) => x.trim())
      const by = (kind === 'album' ? parts[1] : parts[0]) || ''
      const year = kind === 'album' && /^\d{4}$/.test(parts[2] || '') ? parts[2] : ''
      out.push({
        id: playlistId,
        playlistId,
        kind,
        name: name.slice(0, 300),
        by: by.slice(0, 200),
        year,
        thumb: pickImage(r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails)
      })
      if (out.length >= max) return out
    }
  }
  return out
}

/**
 * A playlist's "next" answer → { name, total, items }: its songs in the search's shape.
 * title(raw, channel) gives { artist, title } (parseYouTubeTitle). Private and deleted videos
 * (no length) are left out.
 */
export function parsePlaylistSongs(json, title, max = 200) {
  const pl = json?.contents?.twoColumnWatchNextResults?.playlist?.playlist
  const items = []
  for (const x of pl?.contents || []) {
    const v = x?.playlistPanelVideoRenderer
    const videoId = v?.videoId
    if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) continue
    const raw = text(v.title).trim()
    const ms = durationMs(text(v.lengthText))
    if (!raw || !ms) continue
    const channel = text(v.longBylineText || v.shortBylineText).trim()
    const parsed = title(raw, channel)
    const artist = String(parsed?.artist || channel || '')
    items.push({
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
    if (items.length >= max) break
  }
  const total = Number(pl?.totalVideos)
  return {
    name: typeof pl?.title === 'string' ? pl.title.slice(0, 300) : '',
    total: Number.isFinite(total) ? total : items.length,
    items
  }
}

// ---------- what the window hands over to keep ----------
// The library is kept from what the player window sends: nothing is taken on trust.

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')

/** A song to keep (liked, recent, queued) → its tidy shape, or null. */
export function cleanSong(v) {
  const videoId = typeof v === 'string' ? v.replace(/^yt:/, '') : v?.videoId
  if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return null
  const artist = str(v?.artists || v?.artist, 200)
  const ms = Number(v?.durationMs)
  return {
    id: `yt:${videoId}`,
    videoId,
    uri: `yt:${videoId}`,
    name: str(v?.name, 300),
    rawTitle: str(v?.rawTitle, 300),
    channel: str(v?.channel, 200),
    artists: artist,
    artist,
    album: str(v?.album, 300),
    cover: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    thumb: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
    durationMs: Number.isFinite(ms) && ms > 0 ? Math.min(ms, 864e5) : 0
  }
}

/** An album or playlist to keep → its tidy shape, or null. */
export function cleanList(p) {
  const playlistId = p?.playlistId || p?.id
  if (typeof playlistId !== 'string' || !LIST_ID.test(playlistId)) return null
  const count = Number(p?.count)
  return {
    id: playlistId,
    playlistId,
    kind: p?.kind === 'album' ? 'album' : 'playlist',
    name: str(p?.name, 300) || 'Playlist',
    by: str(p?.by, 200),
    year: /^\d{4}$/.test(p?.year || '') ? p.year : '',
    thumb: safeImage(p?.thumb),
    count: Number.isInteger(count) && count >= 0 ? count : null
  }
}

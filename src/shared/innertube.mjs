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

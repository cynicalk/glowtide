// YouTube Data API v3 for the signed-in user's library and search.
// Free, but quota-limited: 10,000 units a day per Google project; a search costs 100.
// Playback does not go through this API at all (see ytHost.js).

import { createOAuth } from './oauth'
import { isoDurationMs, parseYouTubeTitle } from '../shared/youtube.mjs'

export function createGoogleAuth(getClient) {
  return createOAuth({
    name: 'google',
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    extraAuth: { access_type: 'offline', prompt: 'consent' },
    getClient
  })
}

const thumb = (t, ...prefer) => {
  for (const k of prefer) if (t?.[k]?.url) return t[k].url
  return null
}

/** A video resource or playlist item -> the track shape the UI uses. */
export function slimVideo(v) {
  const sn = v.snippet || {}
  const id = v.contentDetails?.videoId || sn.resourceId?.videoId || v.id?.videoId || v.id
  if (!id || typeof id !== 'string') return null
  const channel = sn.videoOwnerChannelTitle || sn.channelTitle || ''
  const { artist, title } = parseYouTubeTitle(sn.title || '', channel)
  return {
    id: `yt:${id}`,
    videoId: id,
    uri: `yt:${id}`,
    name: title || sn.title || 'Untitled',
    rawTitle: sn.title || '',
    channel,
    artists: artist,
    artist,
    album: '',
    cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    thumb: thumb(sn.thumbnails, 'default', 'medium') || `https://i.ytimg.com/vi/${id}/default.jpg`,
    durationMs: isoDurationMs(v.contentDetails?.duration),
    unavailable: sn.title === 'Private video' || sn.title === 'Deleted video'
  }
}

export function createYouTube(auth) {
  async function call(path, query, retry = true) {
    const token = await auth.getAccessToken()
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
    for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 && retry) {
      auth.forceExpire()
      return call(path, query, false)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = data.error?.errors?.[0]?.reason
      if (reason === 'quotaExceeded')
        throw new Error(
          "Today's YouTube quota for your Google project is used up. It resets at midnight Pacific time."
        )
      if (reason === 'accessNotConfigured')
        throw new Error('Turn on "YouTube Data API v3" for your Google Cloud project.')
      throw new Error(data.error?.message || `YouTube error ${res.status}`)
    }
    return data
  }

  async function all(path, query, max = 200) {
    const items = []
    let pageToken
    do {
      const d = await call(path, { ...query, maxResults: 50, pageToken })
      items.push(...(d.items || []))
      pageToken = d.nextPageToken
    } while (pageToken && items.length < max)
    return items
  }

  return {
    async playlists() {
      const items = await all('playlists', { part: 'snippet,contentDetails', mine: 'true' })
      return items.map((p) => ({
        id: p.id,
        name: p.snippet?.title || 'Untitled',
        count: p.contentDetails?.itemCount ?? null,
        thumb: thumb(p.snippet?.thumbnails, 'default', 'medium')
      }))
    },
    async playlistItems(playlistId) {
      const items = await all('playlistItems', { part: 'snippet,contentDetails', playlistId })
      return items.map(slimVideo).filter((v) => v && !v.unavailable)
    },
    /** Liked videos in YouTube's Music category, the closest the API gets to "Liked music". */
    async likedMusic() {
      const items = await all('videos', { part: 'snippet,contentDetails', myRating: 'like' }, 300)
      return items
        .filter((v) => v.snippet?.categoryId === '10')
        .map(slimVideo)
        .filter(Boolean)
    },
    async search(q) {
      const d = await call('search', {
        part: 'snippet',
        type: 'video',
        videoCategoryId: '10',
        videoEmbeddable: 'true',
        maxResults: 20,
        q
      })
      return (d.items || []).map(slimVideo).filter(Boolean)
    }
  }
}

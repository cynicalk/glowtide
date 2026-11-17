// Thin Spotify Web API client. Playback control needs Spotify Premium;
// Spotify answers 403 PREMIUM_REQUIRED otherwise and we surface that as-is.

import { createOAuth } from './oauth'

export class SpotifyError extends Error {
  constructor(status, message, reason) {
    super(message)
    this.status = status
    this.reason = reason
  }
}

export function createSpotifyAuth(getClientId) {
  return createOAuth({
    name: 'spotify',
    label: 'Spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'user-library-read',
      'user-library-modify',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-read-recently-played',
      'user-read-private'
    ],
    getClient: () => ({ clientId: getClientId() })
  })
}

export function createSpotify(auth) {
  const { getAccessToken, forceExpire } = auth
  async function call(method, path, { query, body, retry = true } = {}) {
    const token = await getAccessToken()
    const url = new URL(path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`)
    for (const [k, v] of Object.entries(query || {}))
      if (v !== undefined && v !== null) url.searchParams.set(k, v)
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (res.status === 401 && retry) {
      forceExpire()
      return call(method, path, { query, body, retry: false })
    }
    if (res.status === 429 && retry) {
      const wait = Math.min(10, Number(res.headers.get('Retry-After') || 1))
      await new Promise((r) => setTimeout(r, wait * 1000))
      return call(method, path, { query, body, retry: false })
    }
    if (res.status === 204 || res.status === 202) return null
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      const e = data?.error || {}
      let msg = e.message || `Spotify error ${res.status}`
      if (e.reason === 'PREMIUM_REQUIRED') msg = 'Controlling playback needs Spotify Premium.'
      if (e.reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(msg))
        msg = 'No active Spotify device. Open Spotify on this PC or pick a device.'
      throw new SpotifyError(res.status, msg, e.reason)
    }
    return data
  }

  const ids = (arr) => arr.join(',')

  return {
    call,
    me: () => call('GET', '/me'),
    player: () => call('GET', '/me/player', { query: { additional_types: 'track,episode' } }),
    play: (body, deviceId) =>
      call('PUT', '/me/player/play', { query: { device_id: deviceId }, body }),
    pause: () => call('PUT', '/me/player/pause'),
    next: () => call('POST', '/me/player/next'),
    previous: () => call('POST', '/me/player/previous'),
    seek: (ms) =>
      call('PUT', '/me/player/seek', { query: { position_ms: Math.max(0, Math.round(ms)) } }),
    shuffle: (state) => call('PUT', '/me/player/shuffle', { query: { state } }),
    repeat: (state) => call('PUT', '/me/player/repeat', { query: { state } }),
    volume: (pct) =>
      call('PUT', '/me/player/volume', { query: { volume_percent: Math.round(pct) } }),
    devices: () => call('GET', '/me/player/devices'),
    transfer: (deviceId, play = true) =>
      call('PUT', '/me/player', { body: { device_ids: [deviceId], play } }),
    queue: () => call('GET', '/me/player/queue'),
    addToQueue: (uri) => call('POST', '/me/player/queue', { query: { uri } }),
    search: (q) =>
      call('GET', '/search', { query: { q, type: 'track,album,playlist', limit: 20 } }),
    likedTracks: (offset = 0) => call('GET', '/me/tracks', { query: { limit: 50, offset } }),
    playlists: (offset = 0) => call('GET', '/me/playlists', { query: { limit: 50, offset } }),
    playlistTracks: (id, offset = 0) =>
      call('GET', `/playlists/${id}/tracks`, { query: { limit: 100, offset } }),
    albumTracks: (id) => call('GET', `/albums/${id}/tracks`, { query: { limit: 50 } }),
    recent: () => call('GET', '/me/player/recently-played', { query: { limit: 30 } }),
    isLiked: (id) => call('GET', '/me/tracks/contains', { query: { ids: id } }),
    setLiked: (id, on) => call(on ? 'PUT' : 'DELETE', '/me/tracks', { query: { ids: ids([id]) } })
  }
}

/** Reduce a Spotify track/episode to what the UI needs. */
export function slimTrack(t) {
  if (!t) return null
  const images = t.album?.images || t.images || t.show?.images || []
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(', ') || t.show?.name || '',
    artist: t.artists?.[0]?.name || t.show?.name || '',
    album: t.album?.name || '',
    albumUri: t.album?.uri,
    cover: images[0]?.url || null,
    thumb: images[images.length - 1]?.url || images[0]?.url || null,
    durationMs: t.duration_ms || 0,
    explicit: !!t.explicit
  }
}

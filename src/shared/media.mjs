// Windows media sessions (SMTC): naming the app and turning its metadata into a track.
// Pure, no I/O.

import { parseYouTubeTitle } from './youtube.mjs'

const KNOWN = [
  [/^spotify(\.exe)?$/i, 'Spotify'],
  [/^(chrome|google\.chrome)/i, 'Chrome'],
  [/^msedge/i, 'Edge'],
  [/^308046B0AF4A39CB$/i, 'Firefox'],
  [/firefox/i, 'Firefox'],
  [/^brave/i, 'Brave'],
  [/^opera/i, 'Opera'],
  [/^vivaldi/i, 'Vivaldi'],
  [/^arc(\.exe)?$/i, 'Arc'],
  [/AppleInc\.AppleMusic/i, 'Apple Music'],
  [/AppleInc\.iTunes|^itunes/i, 'iTunes'],
  [/TIDAL/i, 'TIDAL'],
  [/Deezer/i, 'Deezer'],
  [/AmazonMobileLLC\.AmazonMusic|amazon ?music/i, 'Amazon Music'],
  [/Microsoft\.ZuneMusic/i, 'Media Player'],
  [/^foobar2000/i, 'foobar2000'],
  [/^musicbee/i, 'MusicBee'],
  [/^vlc/i, 'VLC'],
  [/youtube.?music|ytmdesktop|pear/i, 'YouTube Music'],
  [/^xyz\.glowtide\.windows$/i, 'Glowtide']
]
const BROWSERS = new Set(['Chrome', 'Edge', 'Firefox', 'Brave', 'Opera', 'Vivaldi', 'Arc'])

/** A readable name for a session's AppUserModelId ("Spotify.exe" -> "Spotify"). */
export function appLabel(appId) {
  if (!appId) return 'Unknown app'
  for (const [re, name] of KNOWN) if (re.test(appId)) return name
  // Packaged apps: "Publisher.AppName_hash!App" -> "AppName"
  const pkg = appId.match(/^[^.!_]+\.([^_!]+)_[a-z0-9]+!/i)
  const base = pkg ? pkg[1] : appId.replace(/!.*$/, '').split(/[\\/]/).pop()
  return (
    base
      .replace(/\.exe$/i, '')
      .replace(/[._-]+/g, ' ')
      .trim() || appId
  )
}

export function isBrowser(appId) {
  return BROWSERS.has(appLabel(appId))
}

/**
 * Track info from a session's metadata.
 * Browsers playing youtube.com report the channel as artist and the full video title
 * (no album), so those go through the YouTube title parser. YouTube Music in a browser
 * reports a proper album and artist, so it is left alone.
 */
export function systemTrack(m) {
  const rawTitle = (m.title || '').trim()
  let artist = (m.artist || m.albumArtist || '').trim()
  let title = rawTitle
  if (isBrowser(m.app) && !m.album) {
    const parsed = parseYouTubeTitle(rawTitle, artist)
    title = parsed.title || rawTitle
    artist = parsed.artist || artist
  }
  const key = `${m.app}|${artist}|${title}`.toLowerCase()
  return {
    id: `sys:${key}`,
    uri: null,
    name: title || 'Untitled',
    rawTitle,
    artists: artist,
    artist,
    album: (m.album || '').trim(),
    durationMs: Math.max(0, Number(m.durationMs) || 0)
  }
}

/** SMTC repeat mode -> the app's repeat vocabulary. */
export function repeatFromSmtc(mode) {
  return { Track: 'track', List: 'context' }[mode] || 'off'
}

// "Share what's playing": the song as a line of text, with a link when the source has one.
// Pure: no Electron.

/** { text, url } for the track: "Song — Artist" and an open link (Spotify, YouTube Music). */
export function shareText(track, source) {
  if (!track?.name) return null
  const artist = String(track.artists || track.artist || '').trim()
  let url = null
  const id = String(track.id || '')
  if (source === 'spotify' && /^[A-Za-z0-9]{22}$/.test(id))
    url = `https://open.spotify.com/track/${id}`
  const yt = id.match(/^yt:([\w-]{11})$/)
  if (yt) url = `https://music.youtube.com/watch?v=${yt[1]}`
  const line = artist ? `${track.name} — ${artist}` : track.name
  return { text: url ? `${line}\n${url}` : line, url }
}

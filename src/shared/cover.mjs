// The largest cover a source offers for a song. The services hand Glowtide a size meant for a
// list (Spotify 640 px, YouTube 320×180), which goes soft and blocky when the cover fills a
// window or a screen. Pure: the caller checks the larger one exists before using it.

// Spotify album art: one image, several sizes, told apart by a prefix on its id.
const SPOTIFY =
  /^(https:\/\/[a-z0-9-]+\.(?:scdn\.co|spotifycdn\.com)\/image\/)ab67616d0000(?:b273|1e02|4851)([0-9a-f]+)$/i
// YouTube video stills: the same picture at named sizes.
const YOUTUBE = /^(https:\/\/i\.ytimg\.com\/vi\/[\w-]+\/)(?:mq|hq|sd|)default\.jpg$/

/** The larger version of a cover's URL (Spotify 1500 px, YouTube 1280×720), or null. */
export function largerCover(url) {
  if (typeof url !== 'string') return null
  const s = url.match(SPOTIFY)
  if (s) return `${s[1]}ab67616d000082c1${s[2]}`
  const y = url.match(YOUTUBE)
  if (y) return `${y[1]}maxresdefault.jpg`
  return null
}

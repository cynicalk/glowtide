// Serves the page that hosts YouTube's official IFrame player.
//
// Why a local http page: YouTube's embed refuses to play without an http(s)
// referrer, and Electron's renderer is a file:// page. The player window frames
// http://127.0.0.1:43822/yt and talks to it with postMessage.
//
// The video stays visible in the player window. YouTube's terms forbid hiding the
// player or separating the audio, so Glowtide pauses YouTube when the window is hidden.

import { createServer } from 'http'

export const YT_HOST_PORT = 43822
export const YT_HOST_ORIGIN = `http://127.0.0.1:${YT_HOST_PORT}`

const PAGE = String.raw`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>
</head><body><div id="p"></div>
<script>
let player = null, ready = false, loopTrack = false, queued = [], watchdog = null
const send = (m) => parent.postMessage(Object.assign({ glowtide: 'yt' }, m), '*')
function report() {
  if (!ready) return
  const d = (player.getVideoData && player.getVideoData()) || {}
  send({
    type: 'state',
    videoId: d.video_id || null,
    title: d.title || '',
    author: d.author || '',
    duration: player.getDuration() || 0,
    time: player.getCurrentTime() || 0,
    state: player.getPlayerState(),
    playlist: player.getPlaylist() || null,
    index: player.getPlaylistIndex()
  })
}
function run(c) {
  if (!ready) return queued.push(c)
  const a = c.action, x = c.arg
  if (a === 'play') player.playVideo()
  else if (a === 'pause') player.pauseVideo()
  else if (a === 'next') player.nextVideo()
  else if (a === 'previous') {
    if (player.getCurrentTime() > 3 || !player.getPlaylist()) player.seekTo(0, true)
    else player.previousVideo()
  } else if (a === 'seek') player.seekTo(x / 1000, true)
  else if (a === 'shuffle') player.setShuffle(!!x)
  else if (a === 'repeat') { loopTrack = x === 'track'; player.setLoop(x === 'context') }
  else if (a === 'volume') player.setVolume(x)
  else if (a === 'load') {
    if (x.playlistId && !x.videoIds) player.loadPlaylist({ listType: 'playlist', list: x.playlistId, index: x.index || 0 })
    else if (x.videoIds && x.videoIds.length > 1) player.loadPlaylist(x.videoIds.slice(0, 200), x.index || 0)
    else if (x.videoIds) player.loadVideoById(x.videoIds[0])
  }
  setTimeout(report, 150)
}
window.addEventListener('message', (e) => {
  if (e.source !== parent || !e.data || e.data.glowtide !== 'cmd') return
  run(e.data)
})
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('p', {
    width: '100%', height: '100%',
    playerVars: { playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin },
    events: {
      onReady: () => { ready = true; send({ type: 'ready' }); queued.splice(0).forEach(run); report() },
      onStateChange: (e) => {
        if (e.data === 0 && loopTrack) { player.seekTo(0, true); player.playVideo() }
        // A video whose owner blocks this kind of playback shows "Video unavailable"
        // without firing onError. Watch for a start; if none comes, say so and move on.
        if (e.data === -1) {
          clearTimeout(watchdog)
          watchdog = setTimeout(() => {
            const s = player.getPlayerState()
            if (s === -1 || s === 5 || s === 3) {
              send({ type: 'error', code: 'stalled', videoId: (player.getVideoData() || {}).video_id })
              if (player.getPlaylist()) player.nextVideo()
            }
          }, 9000)
        }
        if (e.data === 1 || e.data === 2) clearTimeout(watchdog)
        report()
      },
      onError: (e) => {
        send({ type: 'error', code: e.data, videoId: (player.getVideoData() || {}).video_id })
        if (player.getPlaylist()) setTimeout(() => player.nextVideo(), 1500)
      }
    }
  })
}
setInterval(report, 1000)
</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body></html>`

export function startYtHost() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      // Addressed as 127.0.0.1 only: a website rebinding its domain to this machine
      // arrives with its own Host and is refused.
      if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${YT_HOST_PORT}`)
        return res.writeHead(403).end()
      if (req.url === '/yt' || req.url.startsWith('/yt?')) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        })
        res.end(PAGE)
      } else res.writeHead(404).end()
    })
    server.on('error', reject)
    server.listen(YT_HOST_PORT, '127.0.0.1', () => resolve(server))
  })
}

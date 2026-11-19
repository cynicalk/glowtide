// Demo tracks: preview every style without Spotify, with built-in clips.
// Lyrics are original placeholder text written for this app.

import { parseLrc, estimateWordTiming } from '../shared/lyrics.mjs'

function cover(a, b, c) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="${c}"/><circle cx="210" cy="90" r="120" fill="${a}"/><circle cx="80" cy="230" r="90" fill="${b}"/><rect x="0" y="250" width="300" height="50" fill="${c}" opacity=".6"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const LRC = `[00:01.00] Lights on the edge of the screen
[00:04.20] Colours pulled from the cover
[00:07.40] Every word in its moment
[00:10.80] Big and bright and then gone
[00:14.00]
[00:16.00] Turn it up a little louder
[00:19.20] Let the glow catch the beat
[00:22.60] This is only a demo
[00:25.80] But it moves like a song`

const TRACKS = [
  {
    name: 'Ember hour',
    artist: 'Glowtide demo',
    palette: ['#e07a3a', '#f1d9a8', '#e0a040', '#6b2e17', '#2a1a12']
  },
  {
    name: 'Blue static',
    artist: 'Glowtide demo',
    palette: ['#5b8cff', '#cfe0ff', '#9b7bff', '#1b2a4a', '#e8e8f0']
  },
  {
    name: 'Night garden',
    artist: 'Glowtide demo',
    palette: ['#6ccb7a', '#e9f5d0', '#f2c14e', '#1e3a24', '#b7e36a']
  }
].map((t, i) => ({
  ...t,
  id: `demo-${i}`,
  uri: `demo:${i}`,
  artists: t.artist,
  album: 'Demo tracks',
  durationMs: 30000,
  cover: cover(t.palette[0], t.palette[2], t.palette[3]),
  thumb: cover(t.palette[0], t.palette[2], t.palette[3])
}))

export function createDemo() {
  let i = 0
  let playing = true
  let base = 0
  let at = Date.now()
  let shuffle = false
  let repeat = 'context' // 'off' | 'context' (the list loops) | 'track'
  const lines = estimateWordTiming(parseLrc(LRC), 30000)
  const pos = () => (playing ? base + Date.now() - at : base)

  function tick() {
    if (pos() < TRACKS[i].durationMs) return
    if (repeat === 'track') restart()
    else if (repeat === 'off' && !shuffle && i === TRACKS.length - 1) {
      base = TRACKS[i].durationMs // the end of the list: stop there
      playing = false
    } else next()
  }
  function restart() {
    base = 0
    at = Date.now()
  }
  // Shuffle picks any other song.
  function next() {
    i = shuffle
      ? (i + 1 + Math.floor(Math.random() * (TRACKS.length - 1))) % TRACKS.length
      : (i + 1) % TRACKS.length
    restart()
  }
  return {
    tracks: TRACKS,
    snapshot() {
      tick()
      const { palette, ...track } = TRACKS[i]
      return {
        track,
        palette,
        playback: {
          isPlaying: playing,
          progressMs: pos(),
          at: Date.now(),
          shuffle,
          repeat,
          volume: 70,
          device: { name: 'Demo', type: 'Computer' }
        },
        lyrics: { status: 'synced', lines }
      }
    },
    control(action, arg) {
      if (action === 'play') {
        if (!playing) at = Date.now()
        playing = true
      } else if (action === 'pause') {
        base = pos()
        playing = false
      } else if (action === 'next') next()
      else if (action === 'previous') {
        if (pos() > 3000) base = 0
        else i = (i + TRACKS.length - 1) % TRACKS.length
        base = 0
        at = Date.now()
      } else if (action === 'seek') {
        base = arg
        at = Date.now()
      } else if (action === 'shuffle') {
        shuffle = !!arg
      } else if (action === 'repeat') {
        repeat = ['off', 'context', 'track'].includes(arg) ? arg : 'off'
      } else if (action === 'playIndex') {
        i = arg % TRACKS.length
        base = 0
        at = Date.now()
        playing = true
      }
    }
  }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import vm from 'vm'

// The public player page (player-page/player.js) with a stand-in for YouTube's player: its
// own queue, as Glowtide's commands change it.
function page() {
  const src = readFileSync(new URL('../player-page/player.js', import.meta.url), 'utf8')
  let loaded = null
  let events = null
  const ctx = {
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    location: { origin: 'https://cynicalk.github.io' },
    parent: { postMessage: () => {} },
    window: { addEventListener: () => {} },
    YT: {
      Player: function (el, opts) {
        events = opts.events
        this.loadVideoById = (id) => (loaded = id)
        this.getCurrentTime = () => 10
        this.getDuration = () => 200
        this.getPlayerState = () => 1
        this.getVideoData = () => ({ video_id: loaded })
        for (const f of ['playVideo', 'pauseVideo', 'seekTo', 'setShuffle', 'setLoop'])
          this[f] = () => {}
        this.getPlaylist = () => null
        this.getPlaylistIndex = () => -1
      }
    }
  }
  vm.createContext(ctx)
  vm.runInContext(
    `${src}\n;this.run = run; this.peek = () => ({ order: order.map((k) => list[k]), at })`,
    ctx
  )
  ctx.window.onYouTubeIframeAPIReady()
  events.onReady()
  const id = (c) => c.repeat(11)
  return {
    run: (action, arg) => ctx.run({ action, arg }),
    id,
    // 'a b [c] d': the queue by letter, the song playing in brackets
    queue: () => {
      const s = ctx.peek()
      return s.order.map((x, i) => (i === s.at ? `[${x[0]}]` : x[0])).join(' ')
    },
    playing: () => loaded?.[0]
  }
}

test('the queue: play next, move, remove, jump', () => {
  const p = page()
  p.run('load', { videoIds: ['a', 'b', 'c', 'd'].map(p.id), index: 0 })
  assert.equal(p.queue(), '[a] b c d')
  p.run('next-up', { videoId: p.id('e') })
  assert.equal(p.queue(), '[a] e b c d')
  p.run('move', { from: 4, to: 1 })
  assert.equal(p.queue(), '[a] d e b c')
  p.run('remove', { at: 2 })
  assert.equal(p.queue(), '[a] d b c')
  // not the song playing, not a place that isn't there, not before the song playing
  p.run('remove', { at: 0 })
  p.run('remove', { at: 9 })
  p.run('move', { from: 2, to: 0 })
  p.run('move', { from: 'x', to: 1 })
  assert.equal(p.queue(), '[a] d b c')
  p.run('jump', { at: 2 })
  assert.equal(p.queue(), 'a d [b] c')
  assert.equal(p.playing(), 'b')
})

test('shuffle off brings back your order, with what you changed while shuffled', () => {
  const p = page()
  p.run('load', { videoIds: ['a', 'b', 'c', 'd', 'e'].map(p.id), index: 0 })
  p.run('move', { from: 4, to: 1 }) // a e b c d
  p.run('shuffle', true)
  assert.equal(p.queue().split(' ')[0], '[a]') // the song playing stays first
  assert.deepEqual(p.queue().split(' ').sort(), ['[a]', 'b', 'c', 'd', 'e'])
  p.run('add', { videoId: p.id('f') })
  p.run('next-up', { videoId: p.id('g') })
  const order = p.queue().split(' ')
  p.run('remove', { at: order.indexOf('c') })
  p.run('shuffle', false)
  assert.equal(p.queue(), '[a] g e b d f')
  p.run('shuffle', false) // already off: nothing changes
  assert.equal(p.queue(), '[a] g e b d f')
})

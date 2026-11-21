import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHistory } from '../src/main/history.js'

function setup({ enabled = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'glowtide-history-'))
  const state = { source: 'system', track: null, playback: null }
  const h = createHistory({ dir, getState: () => state, enabled: () => enabled, timer: false })
  const song = (id, name, durationMs = 200000) => ({
    id,
    name,
    artist: 'Band',
    album: 'LP',
    durationMs
  })
  return { dir, state, h, song }
}

// tick every 3 s for ms of play
function play(ctx, ms) {
  for (let t = 0; t <= ms; t += 3000) {
    ctx.h.tick()
    mock.timers.tick(3000)
  }
}

test('a song counts once listened to for 30 seconds, not when skipped', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 })
  const c = setup()
  c.state.playback = { isPlaying: true }
  c.state.track = c.song('a', 'Skipped')
  play(c, 12000)
  c.state.track = c.song('b', 'Kept')
  play(c, 45000)
  c.state.track = null
  c.h.tick()
  const plays = c.h.plays()
  assert.deepEqual(
    plays.map((p) => p.title),
    ['Kept']
  )
  assert.ok(plays[0].ms >= 42000 && plays[0].ms <= 48000, String(plays[0].ms))
  mock.timers.reset()
})

test('paused time does not count, and the demo never counts', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 })
  const c = setup()
  c.state.track = c.song('a', 'Paused')
  c.state.playback = { isPlaying: false }
  play(c, 60000)
  c.state.source = 'demo'
  c.state.playback = { isPlaying: true }
  play(c, 60000)
  c.h.flush()
  assert.equal(c.h.plays().length, 0)
  mock.timers.reset()
})

test('the song still playing counts in the stats once it qualifies, and is saved on quit', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 })
  const c = setup()
  c.state.playback = { isPlaying: true }
  c.state.track = c.song('a', 'Now')
  play(c, 40000)
  assert.equal(c.h.plays().length, 1, 'shown while playing')
  assert.ok(!existsSync(join(c.dir, 'history.jsonl')), 'not written until it ends')
  c.h.flush()
  assert.equal(readFileSync(join(c.dir, 'history.jsonl'), 'utf8').trim().split('\n').length, 1)
  mock.timers.reset()
})

test('history off: nothing recorded; clear removes everything', () => {
  mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 })
  const off = setup({ enabled: false })
  off.state.playback = { isPlaying: true }
  off.state.track = off.song('a', 'Song')
  play(off, 60000)
  off.h.flush()
  assert.equal(off.h.plays().length, 0)

  const c = setup()
  c.state.playback = { isPlaying: true }
  c.state.track = c.song('a', 'Song')
  play(c, 60000)
  c.h.flush()
  assert.equal(c.h.plays().length, 1)
  c.h.clear()
  assert.equal(c.h.plays().length, 0)
  mock.timers.reset()
})

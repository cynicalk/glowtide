import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANIMATIONS,
  duoGradient,
  glowAnimation,
  glowBounds,
  listensToMusic,
  migrateGlowSettings,
  pickDisplays
} from '../src/shared/glow.mjs'

test('the animation, including settings saved before there were four', () => {
  assert.equal(glowAnimation({ animation: 'idle' }), 'idle')
  assert.equal(glowAnimation({ animation: 'bogus', motion: 'still' }), 'none')
  assert.equal(glowAnimation({ motion: 'still', reactToAudio: true }), 'none')
  assert.equal(glowAnimation({ motion: 'flow', reactToAudio: false }), 'default')
  assert.equal(glowAnimation({ motion: 'flow', reactToAudio: true }), 'music')
  assert.equal(glowAnimation(undefined), 'music')
  for (const k of Object.keys(ANIMATIONS)) assert.equal(glowAnimation({ animation: k }), k)
})

test('old switches become an animation once, and a chosen one is kept', () => {
  const old = { glow: { motion: 'flow', reactToAudio: false, thickness: 6 } }
  assert.deepEqual(migrateGlowSettings(old).glow, {
    motion: 'flow',
    reactToAudio: false,
    thickness: 6,
    animation: 'default'
  })
  const chosen = { glow: { animation: 'idle', motion: 'still' } }
  assert.equal(migrateGlowSettings(chosen), chosen)
  assert.equal(migrateGlowSettings(null), null)
  assert.deepEqual(migrateGlowSettings({ fps: 30 }), { fps: 30 })
})

test('only Music Sync listens to the sound output', () => {
  assert.equal(listensToMusic({ animation: 'music' }), true)
  for (const a of ['default', 'idle', 'none']) assert.equal(listensToMusic({ animation: a }), false)
})

test('two colours share the edge by the split, blending where they meet', () => {
  const g = duoGradient(60, 'red', 'blue', 40)
  assert.equal(
    g,
    'conic-gradient(from -20deg, red 0deg, red 196deg, blue 236deg, blue 320deg, red 360deg)'
  )
  // out-of-range splits are held to 10..90 so neither colour vanishes
  assert.match(duoGradient(100, 'a', 'b', 0), /a 324deg, b 324deg/)
  assert.match(duoGradient(0, 'a', 'b', 0), /a 36deg, b 36deg/)
  assert.match(duoGradient('x', 'a', 'b', 0), /a 216deg/)
})

test('which displays get a glow', () => {
  const ds = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(pickDisplays('all', ds, 2), ds)
  assert.deepEqual(pickDisplays('primary', ds, 2), [{ id: 2 }])
  assert.deepEqual(pickDisplays(3, ds, 2), [{ id: 3 }])
  assert.deepEqual(pickDisplays('3', ds, 2), [{ id: 3 }])
  assert.deepEqual(pickDisplays(99, ds, 2), [{ id: 2 }], 'an unplugged display falls back to main')
  assert.deepEqual(pickDisplays('primary', ds, 77), [{ id: 1 }])
  assert.deepEqual(pickDisplays('all', [], 1), [])
})

test('clear of the taskbar, the glow follows the work area', () => {
  const d = {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1032 }
  }
  assert.equal(glowBounds(d, true), d.workArea)
  assert.equal(glowBounds(d, false), d.bounds)
  assert.equal(glowBounds({ bounds: d.bounds }, true), d.bounds)
})

test('glow by time of day: true by day, warm and dim at night, easing between', async () => {
  const { dayTint } = await import('../src/shared/glow.mjs')
  const at = (h, m = 0) => dayTint(new Date(2026, 10, 22, h, m))
  assert.deepEqual(at(12), { warmth: 0, dim: 0 })
  assert.deepEqual(at(23), { warmth: 1, dim: 1 })
  assert.deepEqual(at(3), { warmth: 1, dim: 1 })
  const evening = at(19, 30).warmth
  assert.ok(evening > 0.3 && evening < 0.7, String(evening))
  assert.ok(at(7).warmth > 0 && at(7).warmth < 1, 'morning eases back')
  assert.ok(at(18, 15).warmth < at(20).warmth, 'deepens through the evening')
})

test('the chorus: lines that come back together, not one line that repeats', async () => {
  const { chorusLines } = await import('../src/shared/glow.mjs')
  const L = (...t) => t.map((text, i) => ({ t: i * 1000, text }))
  const song = L(
    'first verse line here',
    'we light the sky tonight',
    'every star is ours',
    'second verse is new',
    'a lonely line repeats',
    'we light the sky tonight',
    'every star is ours',
    'a lonely line repeats here' // differs: not part of anything
  )
  assert.deepEqual([...chorusLines(song)].sort(), [1, 2, 5, 6])
  const lonely = L('one two three', 'something else', 'one two three', 'more of it')
  assert.deepEqual([...chorusLines(lonely)], [])
  assert.deepEqual([...chorusLines([])], [])
})

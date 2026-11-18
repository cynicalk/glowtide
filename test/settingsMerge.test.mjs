import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeSettings } from '../src/shared/settingsMerge.mjs'

const base = {
  source: null,
  fps: 30,
  lyrics: { style: 'stack', display: 'primary', size: 100 },
  widgets: { viz: { bounds: null, enabled: true } }
}

test('ordinary changes go through, including settings that start as null', () => {
  const s = mergeSettings(base, {
    source: 'spotify',
    fps: 60,
    lyrics: { style: 'waves', display: 2528732444 },
    widgets: { viz: { bounds: { x: 10, y: 20, width: 600, height: 300 } } }
  })
  assert.equal(s.source, 'spotify')
  assert.equal(s.fps, 60)
  assert.equal(s.lyrics.style, 'waves')
  assert.equal(s.lyrics.display, 2528732444)
  assert.equal(s.lyrics.size, 100, 'untouched settings stay')
  assert.deepEqual(s.widgets.viz.bounds, { x: 10, y: 20, width: 600, height: 300 })
})

test('nothing new can be added, and nothing reaches a prototype', () => {
  const patch = JSON.parse(
    '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"made_up":1,"lyrics":{"__proto__":{"x":1},"extra":"y"}}'
  )
  const s = mergeSettings(base, patch)
  assert.equal({}.polluted, undefined)
  assert.equal(Object.getPrototypeOf(s), Object.prototype)
  assert.equal(Object.getPrototypeOf(s.lyrics), Object.prototype)
  assert.ok(!('made_up' in s) && !('extra' in s.lyrics))
})

test('a value of the wrong shape is dropped', () => {
  const s = mergeSettings(base, {
    lyrics: 'not an object',
    fps: { a: 1 },
    widgets: { viz: { bounds: { x: 'javascript:alert(1)' }, enabled: [true] } }
  })
  assert.deepEqual(s.lyrics, base.lyrics)
  assert.equal(s.fps, 30)
  assert.equal(s.widgets.viz.bounds, null)
  assert.equal(s.widgets.viz.enabled, true)
})

test('strings are capped', () => {
  assert.equal(mergeSettings(base, { source: 'x'.repeat(5000) }).source.length, 2000)
})

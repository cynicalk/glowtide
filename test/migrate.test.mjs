import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateSettings } from '../src/shared/migrate.mjs'
import { mergeSettings } from '../src/shared/settingsMerge.mjs'

test('the visualizer is dropped; its theme goes to the clock, its accent to the widgets', () => {
  const old = {
    fps: 30,
    widgets: {
      fps: 60,
      viz: { enabled: true, theme: 'neon', accent: '#123456', style: 'ring' },
      clock: { enabled: true, style: 'analog' }
    }
  }
  const s = migrateSettings(old)
  assert.equal(s.widgets.viz, undefined)
  assert.equal(s.widgets.accent, '#123456')
  assert.deepEqual(s.widgets.clock, { enabled: true, style: 'analog', theme: 'neon' })
  assert.equal(s.fps, 30)
  assert.equal(old.widgets.viz.theme, 'neon', 'the saved object is not changed')
})

test('a theme or accent already set is kept', () => {
  const s = migrateSettings({
    widgets: {
      accent: '#abcdef',
      viz: { theme: 'neon', accent: '#123456' },
      clock: { theme: 'album' }
    }
  })
  assert.equal(s.widgets.accent, '#abcdef')
  assert.equal(s.widgets.clock.theme, 'album')
})

test('no clock saved yet: it gets the theme on its own', () => {
  const s = migrateSettings({ widgets: { viz: { theme: 'sunset' } } })
  assert.deepEqual(s.widgets.clock, { theme: 'sunset' })
})

test('current, empty or odd settings pass through', () => {
  const cur = { widgets: { clock: { theme: 'album' } }, glow: { animation: 'idle' } }
  assert.equal(migrateSettings(cur), cur)
  assert.equal(migrateSettings(null), null)
  assert.deepEqual(migrateSettings({}), {})
  assert.deepEqual(migrateSettings({ widgets: { viz: 'x' } }), { widgets: { viz: 'x' } })
})

test('merged into the defaults, nothing of the visualizer is left', () => {
  const defaults = {
    widgets: { fps: 60, accent: '#7c5cff', clock: { theme: 'album', enabled: false } }
  }
  const out = mergeSettings(
    defaults,
    migrateSettings({
      widgets: { viz: { enabled: true, theme: 'neon' }, clock: { enabled: true } }
    })
  )
  assert.deepEqual(out, {
    widgets: { fps: 60, accent: '#7c5cff', clock: { theme: 'neon', enabled: true } }
  })
})

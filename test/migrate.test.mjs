import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateSettings } from '../src/shared/migrate.mjs'
import { mergeSettings } from '../src/shared/settingsMerge.mjs'

test('the visualizer is dropped; its accent moves to the widgets', () => {
  const old = {
    fps: 30,
    widgets: {
      fps: 60,
      viz: { enabled: true, theme: 'neon', accent: '#123456', style: 'ring' }
    }
  }
  const s = migrateSettings(old)
  assert.equal(s.widgets.viz, undefined)
  assert.equal(s.widgets.accent, '#123456')
  assert.equal(s.fps, 30)
  assert.equal(old.widgets.viz.theme, 'neon', 'the saved object is not changed')
})

test('an accent already set is kept', () => {
  const s = migrateSettings({ widgets: { accent: '#abcdef', viz: { accent: '#123456' } } })
  assert.equal(s.widgets.accent, '#abcdef')
})

test('current, empty or odd settings pass through', () => {
  const cur = { widgets: { accent: '#7c5cff' }, glow: { animation: 'idle' } }
  assert.equal(migrateSettings(cur), cur)
  assert.equal(migrateSettings(null), null)
  assert.deepEqual(migrateSettings({}), {})
  assert.deepEqual(migrateSettings({ widgets: { viz: 'x' } }), { widgets: { viz: 'x' } })
})

test('merged into the defaults, nothing of the visualizer or the clock is left', () => {
  const defaults = { widgets: { fps: 60, accent: '#7c5cff', stage: { style: 'ring' } } }
  const out = mergeSettings(
    defaults,
    migrateSettings({
      widgets: {
        viz: { enabled: true, theme: 'neon' },
        clock: { enabled: true, theme: 'neon' },
        stage: { style: 'bars' }
      }
    })
  )
  assert.deepEqual(out, { widgets: { fps: 60, accent: '#7c5cff', stage: { style: 'bars' } } })
})

test('shortcuts that took an app\u2019s own keys are cleared; good ones stay', () => {
  const s = migrateSettings({
    shortcuts: {
      command: 'CommandOrControl+Alt+G',
      playPause: 'CommandOrControl+Space',
      next: 'CommandOrControl+Right',
      like: 'CommandOrControl+L',
      mini: ''
    }
  })
  assert.deepEqual(s.shortcuts, {
    command: 'CommandOrControl+Alt+G',
    playPause: '',
    next: '',
    like: '',
    mini: ''
  })
  const fine = { shortcuts: { command: 'CommandOrControl+Alt+G' } }
  assert.equal(migrateSettings(fine), fine, 'nothing to clear: the same object back')
})

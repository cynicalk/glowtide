// Settings saved by an older Glowtide, brought up to date before they're merged into the
// defaults (which keep only keys Glowtide still knows). Pure; runs on every start, and does
// nothing to settings that are already current.

import { migrateGlowSettings } from './glow.mjs'
import { validAccelerator } from './shortcuts.mjs'

/**
 * - The glow's old "moving light" and "pulse" switches become an animation (glow.mjs).
 * - The desktop visualizer is gone; the full-screen view keeps its custom accent, which
 *   moves to the widget settings.
 */
export function migrateSettings(saved) {
  return dropUnsafeShortcuts(migrateVisualizer(migrateGlowSettings(saved)))
}

/**
 * Shortcuts saved before 1.0.14 could be one modifier and a key (Ctrl+L, Ctrl+←), which took
 * those keys from every app. Any shortcut Glowtide would no longer accept is cleared.
 */
function dropUnsafeShortcuts(s) {
  const sc = s?.shortcuts
  if (!sc || typeof sc !== 'object') return s
  let changed = false
  const next = { ...sc }
  for (const [id, acc] of Object.entries(sc))
    if (acc && !validAccelerator(acc)) {
      next[id] = ''
      changed = true
    }
  return changed ? { ...s, shortcuts: next } : s
}

function migrateVisualizer(s) {
  const w = s?.widgets
  const viz = w?.viz
  if (!viz || typeof viz !== 'object') return s
  const next = { ...w }
  delete next.viz
  if (typeof viz.accent === 'string' && next.accent === undefined) next.accent = viz.accent
  return { ...s, widgets: next }
}

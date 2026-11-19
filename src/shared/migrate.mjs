// Settings saved by an older Glowtide, brought up to date before they're merged into the
// defaults (which keep only keys Glowtide still knows). Pure; runs on every start, and does
// nothing to settings that are already current.

import { migrateGlowSettings } from './glow.mjs'

/**
 * - The glow's old "moving light" and "pulse" switches become an animation (glow.mjs).
 * - The desktop visualizer is gone. The clock used its colour theme and the full-screen
 *   view its custom accent, so those move: theme to the clock, accent to the widgets.
 */
export function migrateSettings(saved) {
  let s = migrateGlowSettings(saved)
  const w = s?.widgets
  const viz = w?.viz
  if (!viz || typeof viz !== 'object') return s
  const next = { ...w }
  delete next.viz
  if (typeof viz.accent === 'string' && next.accent === undefined) next.accent = viz.accent
  const clock = next.clock && typeof next.clock === 'object' ? next.clock : {}
  if (typeof viz.theme === 'string' && clock.theme === undefined)
    next.clock = { ...clock, theme: viz.theme }
  return { ...s, widgets: next }
}

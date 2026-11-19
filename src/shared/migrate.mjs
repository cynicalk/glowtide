// Settings saved by an older Glowtide, brought up to date before they're merged into the
// defaults (which keep only keys Glowtide still knows). Pure; runs on every start, and does
// nothing to settings that are already current.

import { migrateGlowSettings } from './glow.mjs'

/**
 * - The glow's old "moving light" and "pulse" switches become an animation (glow.mjs).
 * - The desktop visualizer is gone; the full-screen view keeps its custom accent, which
 *   moves to the widget settings.
 */
export function migrateSettings(saved) {
  const s = migrateGlowSettings(saved)
  const w = s?.widgets
  const viz = w?.viz
  if (!viz || typeof viz !== 'object') return s
  const next = { ...w }
  delete next.viz
  if (typeof viz.accent === 'string' && next.accent === undefined) next.accent = viz.accent
  return { ...s, widgets: next }
}

// The edge glow's choices, shared by the main process (which windows to open, and where) and
// the glow page (how it looks and moves). Pure; no DOM, no Electron.

/**
 * The four animations:
 * - default: the light travels around the edge at a steady pace.
 * - music:   it travels faster and swells with the beat (listens to this PC's sound output).
 * - idle:    a slow drift and a gentle breathe, the same whether music is loud or quiet.
 * - none:    it holds still.
 */
export const ANIMATIONS = {
  default: { move: true, react: false, speed: 22, breathe: 0.1 },
  music: { move: true, react: true, speed: 22, breathe: 0.15 },
  idle: { move: true, react: false, speed: 7, breathe: 0.22 },
  none: { move: false, react: false, speed: 0, breathe: 0 }
}

/** The animation in effect, reading settings saved before there was a choice of four. */
export function glowAnimation(g) {
  if (g && ANIMATIONS[g.animation]) return g.animation
  if (g?.motion === 'still') return 'none'
  if (g?.reactToAudio === false) return 'default'
  return 'music'
}

/** Settings from disk with the old "moving light" and "pulse" switches turned into an animation. */
export function migrateGlowSettings(saved) {
  const g = saved?.glow
  if (!g || typeof g !== 'object' || ANIMATIONS[g.animation]) return saved
  return { ...saved, glow: { ...g, animation: glowAnimation(g) } }
}

/** Whether Glowtide listens to the sound output for this animation. */
export const listensToMusic = (g) => glowAnimation(g) === 'music'

/**
 * The two-colour edge: the first colour takes `split` percent of the way round, the second
 * the rest, blending where they meet. A conic gradient around the screen's centre, so turning
 * it carries the colours round the edge.
 */
export function duoGradient(split = 60, c1 = 'var(--c)', c2 = 'var(--g2)', blend = 40) {
  const n = Number(split)
  const a = Math.max(10, Math.min(90, Number.isFinite(n) ? n : 60)) * 3.6
  const b = blend / 2
  const deg = (x) => `${Math.round(x * 10) / 10}deg`
  return `conic-gradient(from ${deg(-b)}, ${c1} 0deg, ${c1} ${deg(a - b)}, ${c2} ${deg(a + b)}, ${c2} ${deg(360 - b * 2)}, ${c1} 360deg)`
}

/**
 * Which displays get a glow: 'all', 'primary', or one display's id. An id that isn't
 * connected any more (a monitor unplugged) falls back to the main display.
 */
export function pickDisplays(choice, displays, primaryId) {
  if (!displays.length) return []
  const primary = displays.find((d) => d.id === primaryId) || displays[0]
  if (choice === 'all') return displays
  if (choice === 'primary') return [primary]
  return [displays.find((d) => String(d.id) === String(choice)) || primary]
}

/**
 * Where a display's glow window goes. Clear of the taskbar, it follows the edge of the work
 * area (on Windows, the part of the screen the taskbar doesn't cover), the way a Mac's notch
 * setting keeps the glow off the notch.
 */
export const glowBounds = (display, clearTaskbar) =>
  clearTaskbar && display.workArea ? display.workArea : display.bounds

/**
 * Glow by time of day: how warm and how dim the glow is at this local time. Full and true
 * to the cover by day (8:00 to 18:00), easing into the night through the evening (to 21:00),
 * warm and dimmer at night, easing back from 6:00. Returns { warmth, dim }, each 0..1.
 */
export function dayTint(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60
  let night
  if (h >= 8 && h < 18) night = 0
  else if (h >= 18 && h < 21) night = (h - 18) / 3
  else if (h >= 6 && h < 8) night = 1 - (h - 6) / 2
  else night = 1
  const ease = night * night * (3 - 2 * night) // smooth at both ends
  return { warmth: +ease.toFixed(3), dim: +ease.toFixed(3) }
}

const plainLine = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The chorus, as line indexes: lines (of three words or more) that come back elsewhere in the
 * song together with the line before or after them. A single line that happens to repeat
 * isn't a chorus.
 */
export function chorusLines(lines) {
  const t = (lines || []).map((l) => plainLine(l?.text))
  const long = (s) => s.split(' ').length >= 3
  const at = new Map()
  t.forEach((s, i) => s && long(s) && at.set(s, [...(at.get(s) || []), i]))
  const out = new Set()
  for (const where of at.values()) {
    if (where.length < 2) continue
    for (const i of where) {
      // a neighbour that repeats with it, somewhere else in the song
      const pairs = where.some(
        (j) =>
          j !== i && ((t[i + 1] && t[i + 1] === t[j + 1]) || (t[i - 1] && t[i - 1] === t[j - 1]))
      )
      if (pairs) out.add(i)
    }
  }
  return out
}

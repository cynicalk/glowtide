// Reading the full-screen helper's output (resources/fullscreen.ps1).

/** One line: the full-screen display's bounds (physical pixels), null for none, undefined if unreadable. */
export function parseFullscreenLine(line) {
  let m
  try {
    m = JSON.parse(line)
  } catch {
    return undefined
  }
  if (m?.full === false) return null
  if (m?.full !== true) return undefined
  const r = { x: m.x, y: m.y, width: m.w, height: m.h }
  return Object.values(r).every(Number.isFinite) && r.width > 0 && r.height > 0 ? r : undefined
}

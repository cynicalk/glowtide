import { useEffect } from 'react'

// A frame-rate cap for the transparent full-screen windows (the lyrics overlay).
//
// Windows copies every frame of a see-through window out of the GPU so it can be blended
// over the desktop, and that copy costs the same however little moved. CSS animations run
// at the display's rate (60 Hz or more), so a single gentle float meant a full-screen copy
// every 16 ms. This takes every animation and transition on the page, holds it, and steps
// it forward itself at a lower rate. They keep their own speed (playbackRate included);
// only the number of frames drawn changes.

/** Caps the page at fps while mounted; 60 or more leaves the browser's own rate. */
export function useFrameRateCap(fps) {
  useEffect(() => (fps && fps < 60 ? capFrameRate(fps) : undefined), [fps])
}

/**
 * Steps all of the page's animations at fps frames a second. Animations the page paused
 * itself are left alone; ones it later plays again are picked up. Returns a stop function
 * that hands every animation back to the browser.
 */
export function capFrameRate(fps = 30) {
  const clock = new Map() // animation -> its own time, in ms
  const gap = 1000 / fps - 2
  let last = performance.now()
  let raf
  const loop = (now) => {
    raf = requestAnimationFrame(loop)
    if (now - last < gap) return
    const dt = Math.min(250, now - last)
    last = now
    for (const a of document.getAnimations()) {
      let t = clock.get(a)
      if (a.playState === 'running') {
        // New, or played again by the page: take over from where it is.
        t = Number(a.currentTime) || 0
        a.pause()
      } else if (t === undefined)
        continue // the page's own pause
      else t += dt * a.playbackRate
      const end = a.effect?.getComputedTiming().endTime
      if (Number.isFinite(end) && t >= end) {
        clock.delete(a)
        a.finish() // lands on its final frame and fires its end event, as it would have
        continue
      }
      clock.set(a, t)
      a.currentTime = t
    }
    // Forget animations that have gone (their element was removed).
    if (clock.size > 64)
      for (const a of clock.keys())
        if (a.playState === 'idle' || !a.effect?.target?.isConnected) clock.delete(a)
  }
  raf = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(raf)
    for (const a of clock.keys()) if (a.playState === 'paused') a.play()
    clock.clear()
  }
}

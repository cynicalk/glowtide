import { useEffect, useRef, useState } from 'react'
import { api } from './store'

// the title bar (and the grip above the video): the video isn't dragged under it
const TOP = 58

/**
 * The video in the cover view, moved by its grip (the video itself can't be: the pointer
 * belongs to YouTube's player there). Returns the offset from its corner and the grip. It
 * stays inside the window, and comes back into it when the window shrinks.
 */
export function useYtFloat(settings, on) {
  const saved = settings?.ytFloat || { x: 0, y: 0 }
  const [moved, setMoved] = useState(null) // what you dragged it to, until the settings say so
  const off = moved || saved
  const drag = useRef(null)
  const now = useRef(off) // the offset shown, for the resize handler
  useEffect(() => {
    now.current = off
  })
  const stage = () => document.querySelector('.yt-wrap.as-cover .yt-stage')

  // A smaller window: shown pulled back in, without changing where you put it (so it's
  // there again when the window grows, or comes back from the small player).
  const savedRef = useRef(saved)
  useEffect(() => {
    savedRef.current = saved
  })
  useEffect(() => {
    if (!on) return
    let t = null
    const place = () => {
      if (document.querySelector('.player.small')) return
      const r = stage()?.getBoundingClientRect()
      if (!r) return
      const cur = now.current
      const want = savedRef.current
      // where the saved spot puts it in this window
      const left = r.left - cur.x + want.x
      const top = r.top - cur.y + want.y
      const dx = Math.min(0, window.innerWidth - (left + r.width)) + Math.max(0, -left)
      const dy = Math.min(0, window.innerHeight - (top + r.height)) + Math.max(0, TOP - top)
      const next = { x: Math.round(want.x + dx), y: Math.round(want.y + dy) }
      if (next.x !== cur.x || next.y !== cur.y) setMoved(next)
    }
    // once the window has settled (it also changes size on its way to the small player)
    const fit = () => {
      clearTimeout(t)
      t = setTimeout(place, 250)
    }
    window.addEventListener('resize', fit)
    fit()
    return () => {
      window.removeEventListener('resize', fit)
      clearTimeout(t)
    }
  }, [on])

  const grip = {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      const r = stage()?.getBoundingClientRect()
      if (!r) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { px: e.clientX, py: e.clientY, from: off, r, to: off }
    },
    onPointerMove: (e) => {
      const d = drag.current
      if (!d) return
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
      const dx = clamp(e.clientX - d.px, -d.r.left, window.innerWidth - d.r.right)
      const dy = clamp(e.clientY - d.py, TOP - d.r.top, window.innerHeight - d.r.bottom)
      d.to = { x: Math.round(d.from.x + dx), y: Math.round(d.from.y + dy) }
      setMoved(d.to)
    },
    onPointerUp: () => {
      const d = drag.current
      drag.current = null
      if (d && (d.to.x !== d.from.x || d.to.y !== d.from.y)) api.setSettings({ ytFloat: d.to })
    },
    onLostPointerCapture: () => {
      drag.current = null
    },
    // back to its corner
    onDoubleClick: () => {
      setMoved({ x: 0, y: 0 })
      api.setSettings({ ytFloat: { x: 0, y: 0 } })
    }
  }
  return { off, grip }
}

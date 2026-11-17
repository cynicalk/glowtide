import { useEffect, useMemo, useState } from 'react'
import { resolveColours } from '../../../shared/colour.mjs'

const api = window.glowtide

/** Live app state, settings and lyric lines from the main process. */
export function useGlowtide() {
  const [state, setState] = useState(null)
  const [settings, setSettings] = useState(null)
  const [lyrics, setLyrics] = useState([])
  useEffect(() => {
    let alive = true
    api.init().then((d) => {
      if (!alive) return
      setState(d.state)
      setSettings(d.settings)
      setLyrics(d.lyrics)
    })
    const offs = [api.onState(setState), api.onSettings(setSettings), api.onLyrics(setLyrics)]
    return () => {
      alive = false
      offs.forEach((f) => f())
    }
  }, [])
  return { state, settings, lyrics }
}

export function positionOf(playback, durationMs) {
  if (!playback) return 0
  const p = playback.isPlaying
    ? playback.progressMs + (Date.now() - playback.at)
    : playback.progressMs
  return durationMs ? Math.min(p, durationMs) : p
}

/** Re-render on an interval with the interpolated playback position. */
export function usePosition(playback, durationMs, everyMs = 250) {
  const [pos, setPos] = useState(() => positionOf(playback, durationMs))
  useEffect(() => {
    const update = () => setPos(positionOf(playback, durationMs))
    const first = setTimeout(update, 0)
    const id = setInterval(update, everyMs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [playback, durationMs, everyMs])
  return pos
}

export function useColours(state, settings) {
  return useMemo(
    () => (settings ? resolveColours(state?.palette, settings.colour) : null),
    [state?.palette, settings]
  )
}

export function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export { api }

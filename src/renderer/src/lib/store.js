import { useEffect, useMemo, useState } from 'react'
import { resolveColours } from '../../../shared/colour.mjs'

const api = window.glowtide

/**
 * The new state, reusing every part of the previous one that hasn't changed. State arrives
 * every second while music plays; without this, the track, palette and colours would be
 * new objects each time and every effect keyed on them would restart once a second.
 */
export function keepSame(prev, next) {
  if (!prev || !next || typeof next !== 'object') return next
  const out = { ...next }
  let same = Object.keys(prev).length === Object.keys(next).length
  for (const k of Object.keys(next)) {
    const a = prev[k]
    const b = next[k]
    if (a === b) continue
    if (a && b && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b)) out[k] = a
    else same = false
  }
  return same ? prev : out
}

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
    const offs = [
      api.onState((next) => setState((prev) => keepSame(prev, next))),
      api.onSettings((next) => setSettings((prev) => keepSame(prev, next))),
      api.onLyrics(setLyrics)
    ]
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

/** The connected displays, [{ id, label }], for the display pickers. */
export function useDisplays() {
  const [list, setList] = useState([])
  useEffect(() => {
    let alive = true
    api.displays().then((d) => alive && setList(d || []))
    return () => {
      alive = false
    }
  }, [])
  return list
}

export function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export { api }

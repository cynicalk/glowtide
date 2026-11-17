// Shared motion helpers for the lyric styles.
import { useEffect, useState } from 'react'
import { startBeatTracker } from './beat'

/**
 * The current value and the one it just replaced. Render the previous one with a leaving
 * animation over the new one, so a lyric fades out rather than disappearing.
 * (Storing the previous value during render is React's documented pattern for this.)
 */
export function useSwap(key, value) {
  const [st, setSt] = useState({ key, value, prev: null })
  if (key !== st.key) {
    setSt({ key, value, prev: st.value ? { key: st.key, value: st.value } : null })
  }
  return { cur: { key, value }, prev: key !== st.key ? null : st.prev }
}

/**
 * The latest value for the current group, and the last value of the group before it, kept
 * while it leaves. Unlike useSwap this follows every update within a group, so what leaves
 * is the group as it finally stood (a finished constellation, not its first star).
 */
export function useHandoff(group, value) {
  const [st, setSt] = useState({ group, value, leaving: null })
  if (group !== st.group) setSt({ group, value, leaving: st.value })
  else if (value !== st.value && value != null) setSt({ ...st, value })
  return group !== st.group ? null : st.leaving
}

/**
 * Feeds --pulse (1 on a beat, decaying) and --energy (bass level) into an element's style
 * from the PC's sound output. With no sound, a slow breathe stands in.
 */
export function useBeatVars(ref, { playing, listen }) {
  useEffect(() => {
    const level = { pulse: 0, energy: 0, ok: true }
    const stop =
      playing && listen
        ? startBeatTracker((pulse, energy) => {
            if (pulse === null) level.ok = false
            else Object.assign(level, { pulse, energy, ok: true })
          })
        : null
    let raf
    const loop = (t) => {
      const node = ref.current
      if (node) {
        const live = playing && listen && level.ok
        const p = live ? level.pulse : 0.35 + 0.35 * Math.sin(t / 700)
        const e = live ? level.energy : 0.35 + 0.15 * Math.sin(t / 1900)
        node.style.setProperty('--pulse', p.toFixed(3))
        node.style.setProperty('--energy', e.toFixed(3))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      stop?.()
    }
  }, [ref, playing, listen])
}

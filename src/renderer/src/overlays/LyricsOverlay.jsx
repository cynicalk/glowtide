import { useEffect, useRef, useState } from 'react'
import { positionOf, useColours, useGlowtide } from '../lib/store'
import { wordWindowAt } from '../../../shared/lyrics.mjs'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** Re-render only when the word in focus changes, polling at frame rate. */
function useWordWindow(lines, playback, durationMs, offsetMs) {
  const [win, setWin] = useState({ prev: null, cur: null, next: null, index: -1 })
  const ref = useRef({ lines, playback, durationMs, offsetMs })
  useEffect(() => {
    ref.current = { lines, playback, durationMs, offsetMs }
  }, [lines, playback, durationMs, offsetMs])
  useEffect(() => {
    let raf
    let last = null
    const loop = () => {
      const r = ref.current
      const pos = positionOf(r.playback, r.durationMs) + (r.offsetMs || 0)
      const w = wordWindowAt(r.lines, pos)
      const key = `${w.index}|${w.cur?.t}|${w.next?.t}`
      if (key !== last) {
        last = key
        setWin(w)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return win
}

export default function LyricsOverlay() {
  const { state, settings, lyrics } = useGlowtide()
  const colours = useColours(state, settings)
  const win = useWordWindow(
    lyrics,
    state?.playback,
    state?.track?.durationMs,
    state?.lyricsOffsetMs
  )
  const now = useClock()

  if (!state || !settings || !colours) return null
  const l = settings.lyrics
  const active = state.lyricsStatus === 'synced' && lyrics.length > 0 && !!state.playback?.isPlaying
  const scale = l.size / 100

  return (
    <div
      className={`lyr ${settings.colour.fade ? 'fade' : ''}`}
      style={{
        '--lyr': colours.lyrics,
        '--hi': colours.highlight,
        '--hi-text': colours.highlightText,
        '--big': `calc(min(15vh, 11vw) * ${scale})`,
        fontFamily: `'${l.font}', 'Segoe UI', sans-serif`
      }}
    >
      <div className="dim" style={{ opacity: active ? l.dim / 100 : 0 }} />
      <div className={`lyr-stage ${active ? 'show' : ''}`}>
        {l.showClock && (
          <div className="clock">
            <div className="date">
              {now.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </div>
            <div className="time">
              {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
                .formatToParts(now)
                .filter((p) => p.type !== 'dayPeriod')
                .map((p) => p.value)
                .join('')
                .trim()}
            </div>
          </div>
        )}
        <div className="words">
          <div key={`p${win.prev?.t}`} className="w prev">
            {win.prev?.w || ' '}
          </div>
          <div key={`c${win.cur?.t}`} className="w cur">
            {win.cur?.w || ' '}
          </div>
          <div key={`n${win.next?.t}`} className="w next">
            {win.next && win.cur ? <span className="hl">{win.next.w}</span> : ' '}
          </div>
        </div>
      </div>
    </div>
  )
}

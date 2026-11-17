import { useEffect, useRef, useState } from 'react'
import { positionOf, useColours, useGlowtide } from '../lib/store'
import { wordWindowAt, lineWindowAt } from '../../../shared/lyrics.mjs'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// Line items carry .text, word items .w: present both as { w, t, end }.
const asItem = (x) => (x ? { w: x.w ?? x.text, t: x.t, end: x.end } : null)

/**
 * Re-render only when the item in focus changes, polling at frame rate.
 * mode 'words': one word at a time. mode 'lines': one line at a time, which is all a
 * line-timed file can place exactly.
 */
function useLyricWindow(lines, playback, durationMs, offsetMs, mode) {
  const [win, setWin] = useState({ prev: null, cur: null, next: null, index: -1 })
  const ref = useRef({ lines, playback, durationMs, offsetMs, mode })
  useEffect(() => {
    ref.current = { lines, playback, durationMs, offsetMs, mode }
  }, [lines, playback, durationMs, offsetMs, mode])
  useEffect(() => {
    let raf
    let last = null
    const loop = () => {
      const r = ref.current
      const pos = positionOf(r.playback, r.durationMs) + (r.offsetMs || 0)
      const raw = r.mode === 'lines' ? lineWindowAt(r.lines, pos) : wordWindowAt(r.lines, pos)
      const w = { ...raw, prev: asItem(raw.prev), cur: asItem(raw.cur), next: asItem(raw.next) }
      const key = `${r.mode}|${w.index}|${w.cur?.t}|${w.next?.t}`
      if (key !== last) {
        last = key
        // How far into the word we already are (a seek or a late frame), for the karaoke fill.
        setWin({ ...w, elapsed: w.cur ? Math.max(0, pos - w.cur.t) : 0 })
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
  // Word-timed lyrics go word by word. Line-timed lyrics show whole lines unless the
  // listener asked for estimated words.
  const mode =
    state?.lyricsTiming === 'word' || settings?.lyrics.estimated === 'words' ? 'words' : 'lines'
  const win = useLyricWindow(
    lyrics,
    state?.playback,
    state?.track?.durationMs,
    state?.lyricsOffsetMs,
    mode
  )
  const now = useClock()

  if (!state || !settings || !colours) return null
  const l = settings.lyrics
  // Step aside while Glowtide's own window is in use, so the overlay never covers its controls.
  const active =
    state.lyricsStatus === 'synced' &&
    lyrics.length > 0 &&
    !!state.playback?.isPlaying &&
    !state.playerFocused
  const scale = l.size / 100
  // The fill sweeps across the word in its measured duration. Estimated timing gets no
  // fill: a sweep would claim a precision the estimate doesn't have.
  const measured = state.lyricsTiming === 'word' && mode === 'words'
  // A long line shrinks so it wraps into two or three stacked rows, like the word view.
  const len = win.cur?.w?.length || 0
  const lineScale = len <= 12 ? 0.9 : len <= 24 ? 0.68 : len <= 40 ? 0.52 : 0.42
  const wipe =
    measured && win.cur
      ? {
          '--d': `${Math.max(80, win.cur.end - win.cur.t)}ms`,
          '--delay': `${-Math.min(win.elapsed || 0, win.cur.end - win.cur.t)}ms`,
          animationPlayState: state.playback?.isPlaying ? 'running' : 'paused'
        }
      : undefined

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
        <div
          className={`words ${mode}`}
          style={mode === 'lines' ? { '--line': `calc(var(--big) * ${lineScale})` } : undefined}
        >
          <div key={`p${win.prev?.t}`} className="w prev">
            {win.prev?.w || ' '}
          </div>
          <div key={`c${win.cur?.t}`} className={`w cur ${wipe ? 'wipe' : ''}`} style={wipe}>
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

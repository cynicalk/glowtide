// Extra lyric styles: Aura, Waves and Beat.
import { useMemo } from 'react'
import { useSwap } from '../lib/motion'

const NBSP = ' '
const fitLine = (len) => (len <= 12 ? 0.9 : len <= 24 ? 0.66 : len <= 40 ? 0.5 : 0.4)

/** Aura: the lyric floats over a living gradient cloud in the cover's colours. */
export function Aura({ win, mode, beatRef }) {
  const text = win?.cur?.w || ''
  const { cur, prev } = useSwap(win?.cur?.t ?? 'none', text)
  const k = (t) => (mode === 'lines' ? fitLine(t.length) : 1)
  return (
    <div className="aura" ref={beatRef}>
      <div className={`aura-cloud ${text ? 'on' : ''}`}>
        <div className="aura-flow" />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="slot">
        {prev && (
          <div key={`l${prev.key}`} className="aura-text leave" style={{ '--k': k(prev.value) }}>
            {prev.value}
          </div>
        )}
        <div key={`a${cur.key}`} className="aura-text" style={{ '--k': k(cur.value) }}>
          {cur.value || NBSP}
        </div>
      </div>
      <div key={`n${win?.next?.t}`} className="aura-next">
        {win?.cur && win?.next ? win.next.w : NBSP}
      </div>
    </div>
  )
}

function sinePath(width, amp, wavelength, y) {
  let d = `M0 ${y}`
  for (let x = 0; x <= width; x += 16)
    d += ` L${x} ${(y + amp * Math.sin((x / wavelength) * Math.PI * 2)).toFixed(1)}`
  return d
}

/** Waves: the line rides a ripple that swells with the music; sung words light up. */
export function Waves({ view, beatRef }) {
  const paths = useMemo(
    () => [
      sinePath(3200, 26, 400, 150),
      sinePath(3200, 18, 266, 150),
      sinePath(3200, 34, 533, 150)
    ],
    []
  )
  const words = view?.words || null
  const { cur, prev } = useSwap(words ? view.t : 'none', words)
  const lineOf = (ws) => ws.map((w) => w.w).join(' ')
  const renderLine = (ws, cls, key) => (
    <div key={key} className={`wave-line ${cls}`} style={{ '--k': fitLine(lineOf(ws).length) }}>
      {ws.map((w, i) => (
        <span
          key={i}
          className={`${w.lit ? 'lit' : ''} ${w.current ? 'cur' : ''}`}
          style={{ animationDelay: `${-i * 0.22}s` }}
        >
          {w.w}
        </span>
      ))}
    </div>
  )
  return (
    <div className="waves" ref={beatRef}>
      <svg className="wave-lines" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <g className="wave-swell">
          {paths.map((d, i) => (
            <path key={i} d={d} className={`wl wl${i}`} />
          ))}
        </g>
      </svg>
      <div className="wave-prev">{words && view.prev ? view.prev : NBSP}</div>
      <div className="slot">
        {prev && renderLine(prev.value, 'leave', `l${prev.key}`)}
        {cur.value ? (
          renderLine(cur.value, '', `w${cur.key}`)
        ) : (
          <div className="wave-line">{NBSP}</div>
        )}
      </div>
      <div className="wave-next">
        {words && view.next ? <span className="hl">{view.next}</span> : NBSP}
      </div>
    </div>
  )
}

/** Beat: the word pulses with the music and rings ripple out on every beat. */
export function Beat({ win, mode, beatRef }) {
  const text = win?.cur?.w || ''
  const { cur, prev } = useSwap(win?.cur?.t ?? 'none', text)
  const k = (t) => (mode === 'lines' ? fitLine(t.length) : 1)
  return (
    <div className="beat" ref={beatRef}>
      <div className="beat-rings">
        <i />
        <i />
      </div>
      <div className="slot">
        {prev && (
          <div key={`l${prev.key}`} className="beat-text leave" style={{ '--k': k(prev.value) }}>
            {prev.value}
          </div>
        )}
        <div key={`b${cur.key}`} className="beat-text" style={{ '--k': k(cur.value) }}>
          {cur.value || NBSP}
        </div>
      </div>
      <div className="beat-bars">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ '--i': Math.abs(i - 11.5) / 11.5 }} />
        ))}
      </div>
    </div>
  )
}

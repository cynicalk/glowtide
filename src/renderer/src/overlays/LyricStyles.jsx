// Extra lyric styles: Aura, Waves and Beat.
import { useEffect, useMemo, useRef } from 'react'
import { startBeatTracker } from '../lib/beat'

const fitLine = (len) => (len <= 12 ? 0.9 : len <= 24 ? 0.66 : len <= 40 ? 0.5 : 0.4)

/** Aura: the word or line floats over a soft, slowly shifting cloud of the cover's colours. */
export function Aura({ win, mode }) {
  if (!win) return null
  const text = win.cur?.w
  const k = mode === 'lines' ? fitLine(text?.length || 0) : 1
  return (
    <div className="aura">
      <div className={`aura-cloud ${text ? 'on' : ''}`}>
        <i />
        <i />
        <i />
      </div>
      <div key={`a${win.cur?.t}`} className="aura-text" style={{ '--k': k }}>
        {text || ' '}
      </div>
      <div key={`n${win.next?.t}`} className="aura-next">
        {win.cur && win.next ? win.next.w : ' '}
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

/** Waves: the whole line rides a ripple; sung words light up; flowing lines behind. */
export function Waves({ view }) {
  const paths = useMemo(
    () => [
      sinePath(3200, 26, 400, 150),
      sinePath(3200, 18, 266, 160),
      sinePath(3200, 34, 533, 140)
    ],
    []
  )
  const words = view?.words
  const len = words ? words.map((w) => w.w).join(' ').length : 0
  return (
    <div className="waves">
      <svg className="wave-lines" viewBox="0 0 1600 300" preserveAspectRatio="none">
        {paths.map((d, i) => (
          <path key={i} d={d} className={`wl wl${i}`} />
        ))}
      </svg>
      <div className="wave-prev">{words && view.prev ? view.prev : ' '}</div>
      <div key={view?.t} className="wave-line" style={{ '--k': fitLine(len) }}>
        {words
          ? words.map((w, i) => (
              <span
                key={i}
                className={`${w.lit ? 'lit' : ''} ${w.current ? 'cur' : ''}`}
                style={{ animationDelay: `${-i * 0.22}s` }}
              >
                {w.w}
              </span>
            ))
          : ' '}
      </div>
      <div className="wave-next">
        {words && view.next ? <span className="hl">{view.next}</span> : ' '}
      </div>
    </div>
  )
}

/**
 * Beat: the word pulses with the music and a ring ripples out on every beat. Listens to the
 * PC's sound output like the edge glow; with no sound it breathes slowly instead.
 */
export function Beat({ win, mode, playing, listen }) {
  const el = useRef(null)
  const level = useRef({ pulse: 0, energy: 0, ok: true })
  useEffect(() => {
    if (!playing || !listen) return
    level.current.ok = true
    return startBeatTracker((pulse, energy) => {
      if (pulse === null) level.current = { pulse: 0, energy: 0, ok: false }
      else level.current = { pulse, energy, ok: true }
    })
  }, [playing, listen])
  useEffect(() => {
    let raf
    const loop = (t) => {
      const node = el.current
      if (node) {
        const l = level.current
        const p = l.ok && listen ? l.pulse : 0.5 + 0.5 * Math.sin(t / 700)
        const e = l.ok && listen ? l.energy : 0.4
        node.style.setProperty('--pulse', p.toFixed(3))
        node.style.setProperty('--energy', e.toFixed(3))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [listen])
  if (!win) return null
  const text = win.cur?.w
  const k = mode === 'lines' ? fitLine(text?.length || 0) : 1
  return (
    <div className="beat" ref={el}>
      <div className="beat-rings">
        <i />
        <i />
      </div>
      <div key={`b${win.cur?.t}`} className="beat-text" style={{ '--k': k }}>
        {text || ' '}
      </div>
      <div className="beat-bars">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ '--i': Math.abs(i - 11.5) / 11.5 }} />
        ))}
      </div>
    </div>
  )
}

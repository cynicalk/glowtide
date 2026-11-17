import { useEffect, useState } from 'react'
import { useGlowtide } from '../lib/store'
import { vizPalette } from '../../../shared/viz.mjs'
import { timeInWords } from '../../../shared/clock.mjs'

const place = new URLSearchParams(window.location.hash.split('?')[1] || '').get('place')

function useNow(everyMs) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

function Analog({ now, seconds }) {
  const h = (now.getHours() % 12) + now.getMinutes() / 60
  const m = now.getMinutes() + now.getSeconds() / 60
  const s = now.getSeconds()
  const hand = (deg, len, w, cls) => (
    <line
      className={cls}
      x1="50"
      y1="50"
      x2={50 + len * Math.sin((deg * Math.PI) / 180)}
      y2={50 - len * Math.cos((deg * Math.PI) / 180)}
      strokeWidth={w}
      strokeLinecap="round"
    />
  )
  return (
    <svg className="ck-analog" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" className="ck-face" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180
        const r1 = i % 3 ? 40 : 37
        return (
          <line
            key={i}
            className="ck-tick"
            x1={50 + r1 * Math.sin(a)}
            y1={50 - r1 * Math.cos(a)}
            x2={50 + 43 * Math.sin(a)}
            y2={50 - 43 * Math.cos(a)}
            strokeWidth={i % 3 ? 1 : 2}
            strokeLinecap="round"
          />
        )
      })}
      {hand(h * 30, 24, 3.4, 'ck-hand')}
      {hand(m * 6, 34, 2.2, 'ck-hand')}
      {seconds && hand(s * 6, 38, 0.9, 'ck-sec')}
      <circle cx="50" cy="50" r="2.4" className="ck-pin" />
    </svg>
  )
}

/** The desktop clock widget: five faces, colours from the theme or the album. */
export default function ClockWidget() {
  const { state, settings } = useGlowtide()
  const c = settings?.widgets.clock
  const now = useNow(c?.seconds || c?.style === 'analog' ? 1000 : 5000)
  if (!state || !settings) return null
  const palette = vizPalette(settings.widgets.viz.theme, {
    palette: state.palette,
    accent: settings.widgets.viz.accent
  })
  const hh = now.getHours()
  const h = c.h24 ? hh : hh % 12 || 12
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const ampm = c.h24 ? '' : hh < 12 ? 'AM' : 'PM'
  const date =
    c.date === 'none'
      ? ''
      : now.toLocaleDateString(undefined, {
          weekday: c.date === 'long' ? 'long' : 'short',
          month: c.date === 'long' ? 'long' : 'short',
          day: 'numeric'
        })
  return (
    <div
      className={`ck ck-${c.style} colour-${c.colour} ${c.glow ? 'glow' : ''} ${place !== 'wallpaper' ? 'editable' : ''}`}
      style={{
        opacity: c.opacity / 100,
        fontFamily: `'${c.font}', 'Segoe UI', sans-serif`,
        '--p1': palette[0],
        '--p2': palette[1],
        '--p3': palette[2]
      }}
    >
      {c.style === 'digital' && (
        <>
          <div className="ck-time">
            <span className="ck-ink">
              {h}:{mm}
            </span>
            {c.seconds && <span className="ck-sm ck-ink">:{ss}</span>}
            {ampm && <span className="ck-ampm">{ampm}</span>}
          </div>
          {date && <div className="ck-date">{date}</div>}
        </>
      )}
      {c.style === 'stacked' && (
        <>
          <div className="ck-stack ck-ink">
            <span>{String(h).padStart(2, '0')}</span>
            <span>{mm}</span>
          </div>
          {date && <div className="ck-date">{date}</div>}
        </>
      )}
      {c.style === 'minimal' && (
        <div className="ck-min">
          <span className="ck-ink">
            {h}:{mm}
            {c.seconds ? `:${ss}` : ''}
          </span>
          {date && <span className="ck-date"> · {date}</span>}
        </div>
      )}
      {c.style === 'analog' && <Analog now={now} seconds={c.seconds} />}
      {c.style === 'words' && (
        <>
          <div className="ck-words ck-ink">it’s {timeInWords(hh, now.getMinutes())}</div>
          {date && <div className="ck-date">{date}</div>}
        </>
      )}
    </div>
  )
}

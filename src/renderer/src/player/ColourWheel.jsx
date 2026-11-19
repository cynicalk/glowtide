import { useRef, useState } from 'react'
import { Sun, SunDim } from 'lucide-react'
import { hexToHsv, hsvToHex, safeHex } from '../../../shared/colour.mjs'

const MIN_V = 0.1 // never fully black: the hue would be lost, and a black glow shows nothing

/**
 * A colour wheel: hue round the rim, white at the centre, and a brightness slider below.
 * The wheel darkens with the brightness, so it shows the colours you can actually pick.
 */
export default function ColourWheel({ label, note, value: raw, onChange, size = 112 }) {
  const value = safeHex(raw, '#808080')
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [seen, setSeen] = useState(value)
  const wheel = useRef(null)
  // Follow a change made elsewhere (the other panel, a reset), but keep our own hue when the
  // colour is the same: a grey has no hue of its own, and the knob shouldn't jump to red.
  if (value !== seen) {
    setSeen(value)
    if (hsvToHex(hsv) !== value) setHsv(hexToHsv(value))
  }
  const send = (next) => {
    setHsv(next)
    onChange(hsvToHex(next))
  }
  const pick = (e) => {
    const r = wheel.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2))
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    send([h, s, Math.max(MIN_V, hsv[2])])
  }
  const [h, s, v] = hsv
  const rad = (h * Math.PI) / 180
  const knob = {
    left: `${50 + Math.sin(rad) * s * 50}%`,
    top: `${50 - Math.cos(rad) * s * 50}%`,
    background: hsvToHex(hsv)
  }
  return (
    <div className="cwheel">
      <div className="cw-head">
        <span>{label}</span>
        {note && <em>{note}</em>}
      </div>
      <div
        ref={wheel}
        className="cw-ring"
        style={{ width: size, height: size }}
        role="slider"
        aria-label={`${label} colour`}
        aria-valuetext={hsvToHex(hsv)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && pick(e)}
        onKeyDown={(e) => {
          const step = { ArrowLeft: -6, ArrowRight: 6 }[e.key]
          if (step) send([(h + step + 360) % 360, Math.max(s, 0.5), v])
        }}
      >
        <i className="cw-dark" style={{ opacity: 1 - v }} />
        <b className="cw-knob" style={knob} />
      </div>
      <div className="cw-bright">
        <SunDim size={12} />
        <input
          type="range"
          min={Math.round(MIN_V * 100)}
          max={100}
          value={Math.round(v * 100)}
          aria-label={`${label} brightness`}
          style={{ '--p': `${((v - MIN_V) / (1 - MIN_V)) * 100}%` }}
          onChange={(e) => send([h, s, Number(e.target.value) / 100])}
        />
        <Sun size={12} />
      </div>
    </div>
  )
}

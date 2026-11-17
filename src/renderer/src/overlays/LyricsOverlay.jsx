import { useEffect, useMemo, useRef, useState } from 'react'
import { positionOf, useColours, useGlowtide } from '../lib/store'
import { wordWindowAt, lineWindowAt, lineWordsAt } from '../../../shared/lyrics.mjs'
import { Aura, Waves, Beat } from './LyricStyles'
import {
  buildFigures,
  labelledStars,
  constellationAt,
  rand,
  seedOf,
  VIEW
} from '../../../shared/constellation.mjs'

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
 * Polls the playback position at frame rate and re-renders only when what is shown changes.
 * compute(lines, pos, opts) -> { key, ...view }
 */
function useLyricView(compute, lines, playback, durationMs, offsetMs, opts) {
  const [view, setView] = useState(null)
  const ref = useRef({ lines, playback, durationMs, offsetMs, opts })
  useEffect(() => {
    ref.current = { lines, playback, durationMs, offsetMs, opts }
  }, [lines, playback, durationMs, offsetMs, opts])
  useEffect(() => {
    let raf
    let last = null
    const loop = () => {
      const r = ref.current
      const pos = positionOf(r.playback, r.durationMs) + (r.offsetMs || 0)
      const v = compute(r.lines, pos, r.opts)
      if (v.key !== last) {
        last = v.key
        setView({ ...v, pos })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [compute])
  return view
}

function stackView(lines, pos, { mode }) {
  const raw = mode === 'lines' ? lineWindowAt(lines, pos) : wordWindowAt(lines, pos)
  const w = { ...raw, prev: asItem(raw.prev), cur: asItem(raw.cur), next: asItem(raw.next) }
  return { ...w, key: `${mode}|${w.index}|${w.cur?.t}|${w.next?.t}` }
}

// Splitting the song into figures is done once per song, not every frame.
let figCache = { lines: null, seed: null, figures: [] }
function wavesView(lines, pos, { mode }) {
  return lineWordsAt(lines, pos, mode)
}

function skyView(lines, pos, opts) {
  if (figCache.lines !== lines || figCache.seed !== opts.seed)
    figCache = { lines, seed: opts.seed, figures: buildFigures(lines, opts.seed) }
  return constellationAt(lines, pos, { ...opts, figures: figCache.figures })
}

function Clock({ now, serif }) {
  return (
    <div className={`clock ${serif ? 'serif' : ''}`}>
      <div className="date">
        {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
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
  )
}

/** Blurred album art with film grain behind everything, like a lock screen wallpaper. */
function Backdrop({ kind, strength, cover, on }) {
  if (kind === 'none') return null
  const opacity = on ? strength / 100 : 0
  if (kind === 'cover' && cover)
    return (
      <div className="backdrop-art" style={{ opacity }}>
        <img src={cover} alt="" />
        <div className="grain" />
      </div>
    )
  return <div className="dim" style={{ opacity }} />
}

function Stack({ win, mode, measured, playing }) {
  if (!win) return null
  const len = win.cur?.w?.length || 0
  const lineScale = len <= 12 ? 0.9 : len <= 24 ? 0.68 : len <= 40 ? 0.52 : 0.42
  // The fill sweeps across the word in its measured duration. Estimated timing gets no
  // fill: a sweep would claim a precision the estimate doesn't have.
  const elapsed = win.cur ? Math.max(0, win.pos - win.cur.t) : 0
  const wipe =
    measured && win.cur
      ? {
          '--d': `${Math.max(80, win.cur.end - win.cur.t)}ms`,
          '--delay': `${-Math.min(elapsed, win.cur.end - win.cur.t)}ms`,
          animationPlayState: playing ? 'running' : 'paused'
        }
      : undefined
  return (
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
  )
}

const SPARKLE =
  'M0,-1 C0.1,-0.1 0.1,-0.1 1,0 C0.1,0.1 0.1,0.1 0,1 C-0.1,0.1 -0.1,0.1 -1,0 C-0.1,-0.1 -0.1,-0.1 0,-1 Z'

/** Faint background stars, fixed per song, twinkling at their own pace. */
function Starfield({ seed }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 140 }, (_, i) => ({
        x: rand(seed + i * 3) * VIEW.w,
        y: rand(seed + i * 5 + 1) * VIEW.h,
        r: 0.6 + rand(seed + i * 11 + 2) * 1.5,
        d: 2 + rand(seed + i * 17 + 3) * 5,
        o: 0.15 + rand(seed + i * 19 + 4) * 0.45
      })),
    [seed]
  )
  return (
    <g className="starfield">
      {dots.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.r}
          style={{ '--o': p.o, animationDuration: `${p.d}s`, animationDelay: `-${p.d * p.o}s` }}
        />
      ))}
    </g>
  )
}

/** A real constellation filling with the verse: lit stars glow, the rest wait faintly. */
function Constellation({ sky, mode, scale }) {
  if (!sky?.figure) return null
  const f = sky.focus
  // Small, recent and non-overlapping word labels; the caption carries the size setting.
  const labelPx = Math.round(17 * Math.min(1.15, Math.max(0.85, scale)))
  const labels = labelledStars(sky.stars, { fontPx: labelPx })
  // A line caption shrinks with its length so it stays on screen.
  const capSize =
    mode === 'lines' && f ? Math.min(96, Math.max(42, 1500 / Math.max(8, f.text.length))) : 104
  return (
    <>
      <g key={sky.figure.n} className="figure">
        {sky.edges.map((e, i) => {
          const p = sky.stars[e.a]
          const q = sky.stars[e.b]
          return (
            <line
              key={i}
              className={`edge ${e.lit ? 'lit' : ''}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
            />
          )
        })}
        {sky.stars.map((s, i) => {
          const r = s.m === 1 ? 6.5 : s.m === 2 ? 5 : 3.8
          return (
            <g key={i} className={`star ${s.lit ? 'lit' : ''} ${s.current ? 'cur' : ''}`}>
              {s.lit && <circle className="halo" cx={s.x} cy={s.y} r={r * 4.2} />}
              <circle className="core" cx={s.x} cy={s.y} r={s.lit ? r : r * 0.55} />
              {labels.has(i) && (
                <text x={s.x + 12} y={s.y - 12} style={{ fontSize: labelPx }}>
                  {s.word}
                </text>
              )}
            </g>
          )
        })}
        {f && (
          <g key={sky.key} className="focus">
            <circle className="ring" cx={f.x} cy={f.y} r={28} />
            <path className="spark" d={SPARKLE} transform={`translate(${f.x} ${f.y}) scale(22)`} />
          </g>
        )}
      </g>
      {f && (
        <text
          key={`cap${sky.key}`}
          className="caption"
          x={VIEW.w / 2}
          y={VIEW.h - 95}
          textAnchor="middle"
          style={{ fontSize: capSize * scale }}
        >
          {f.text}
        </text>
      )}
    </>
  )
}

/** Which constellation this is, with its meaning and a short note. */
function NameCard({ figure }) {
  if (!figure) return null
  return (
    <div key={figure.id + figure.n} className="namecard">
      <div className="nc-name">{figure.name}</div>
      <div className="nc-title">{figure.title}</div>
      <div className="nc-desc">{figure.desc}</div>
    </div>
  )
}

export default function LyricsOverlay() {
  const { state, settings, lyrics } = useGlowtide()
  const colours = useColours(state, settings)
  const l = settings?.lyrics
  const STYLES = ['stack', 'constellation', 'aura', 'waves', 'beat']
  const style = STYLES.includes(l?.style) ? l.style : 'stack'
  // Word-timed lyrics go word by word. Line-timed lyrics show whole lines unless the
  // listener asked for estimated words.
  const mode = state?.lyricsTiming === 'word' || l?.estimated === 'words' ? 'words' : 'lines'
  const seed = seedOf(state?.track?.id)
  const opts = useMemo(() => ({ mode, seed }), [mode, seed])
  const win = useLyricView(
    style === 'constellation' ? skyView : style === 'waves' ? wavesView : stackView,
    lyrics,
    state?.playback,
    state?.track?.durationMs,
    state?.lyricsOffsetMs,
    opts
  )
  const now = useClock()

  if (!state || !settings || !colours) return null
  // Step aside while Glowtide's own window is in use, so the overlay never covers its controls.
  const active =
    state.lyricsStatus === 'synced' &&
    lyrics.length > 0 &&
    !!state.playback?.isPlaying &&
    !state.playerFocused
  const scale = l.size / 100
  const measured = state.lyricsTiming === 'word' && mode === 'words'

  return (
    <div
      className={`lyr s-${style} ${settings.colour.fade ? 'fade' : ''}`}
      style={{
        '--lyr': colours.lyrics,
        '--hi': colours.highlight,
        '--hi-text': colours.highlightText,
        '--sec': colours.secondary,
        '--big': `calc(min(15vh, 11vw) * ${scale})`,
        fontFamily: `'${l.font}', 'Segoe UI', sans-serif`
      }}
    >
      <Backdrop
        kind={l.backdrop || 'dim'}
        strength={l.dim}
        cover={state.track?.cover}
        on={active}
      />
      <div className={`lyr-stage ${active ? 'show' : ''}`}>
        {l.showClock && <Clock now={now} serif={l.clockFont === 'serif'} />}
        {style === 'constellation' && <NameCard figure={win?.figure} />}
        {style === 'stack' && (
          <Stack
            win={win && 'cur' in win ? win : null}
            mode={mode}
            measured={measured}
            playing={!!state.playback?.isPlaying}
          />
        )}
        {style === 'aura' && <Aura win={win && 'cur' in win ? win : null} mode={mode} />}
        {style === 'waves' && <Waves view={win && 'words' in win ? win : null} />}
        {style === 'beat' && (
          <Beat
            win={win && 'cur' in win ? win : null}
            mode={mode}
            playing={active}
            listen={settings.glow.reactToAudio}
          />
        )}
        {style === 'constellation' && (
          <svg
            className="sky"
            viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
            preserveAspectRatio="xMidYMid slice"
          >
            <Starfield seed={seed} />
            <Constellation sky={win?.stars ? win : null} mode={mode} scale={scale} />
          </svg>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { positionOf, useColours, useGlowtide } from '../lib/store'
import { wordWindowAt, lineWindowAt, lineWordsAt, karaokeAt } from '../../../shared/lyrics.mjs'
import { Aura, Waves, Beat, Karaoke } from './LyricStyles'
import { useSwap, useBeatVars, useHandoff, useLinger } from '../lib/motion'
import { useFrameRateCap } from '../lib/frameRate'
import { listensToMusic } from '../../../shared/glow.mjs'
import { Messages } from './Messages'
import { messagesView } from './messagesView'
import {
  buildFigures,
  placeLabels,
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
 * Polls the playback position about 30 times a second and re-renders only when what is
 * shown changes. Stops entirely while the overlay is hidden (enabled false).
 * compute(lines, pos, opts) -> { key, ...view }
 */
function useLyricView(compute, lines, playback, durationMs, offsetMs, opts, enabled) {
  const [view, setView] = useState(null)
  const ref = useRef({ lines, playback, durationMs, offsetMs, opts })
  useEffect(() => {
    ref.current = { lines, playback, durationMs, offsetMs, opts }
  }, [lines, playback, durationMs, offsetMs, opts])
  useEffect(() => {
    if (!enabled) return
    let raf
    let last = null
    let lastT = 0
    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      if (t - lastT < 30) return
      lastT = t
      const r = ref.current
      const pos = positionOf(r.playback, r.durationMs) + (r.offsetMs || 0)
      const v = compute(r.lines, pos, r.opts)
      if (v.key !== last) {
        last = v.key
        setView({ ...v, pos })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [compute, enabled])
  return view
}

function stackView(lines, pos, { mode }) {
  const raw = mode === 'lines' ? lineWindowAt(lines, pos) : wordWindowAt(lines, pos)
  const w = { ...raw, prev: asItem(raw.prev), cur: asItem(raw.cur), next: asItem(raw.next) }
  return { ...w, key: `${mode}|${w.index}|${w.cur?.t}|${w.next?.t}` }
}

// Splitting the song into figures is done once per song, not every frame.
let figCache = { lines: null, seed: null, figures: [] }
/** The sweep needs a vivid colour: a greyish highlight (black-and-white cover) gets a bright one. */
function karaokeColour(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(mx + mn - 1))
  return sat < 0.3 ? '#4cc9ff' : hex
}

function karaokeView(lines, pos) {
  return karaokeAt(lines, pos)
}

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
  const { prev: leaving } = useSwap(win?.cur?.t ?? 'none', win?.cur?.w || '')
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
      <div className="slot">
        {leaving && (
          <div key={`l${leaving.key}`} className="w cur leave">
            {leaving.value}
          </div>
        )}
        <div key={`c${win.cur?.t}`} className={`w cur ${wipe ? 'wipe' : ''}`} style={wipe}>
          {win.cur?.w || ' '}
        </div>
      </div>
      <div key={`n${win.next?.t}`} className="w next">
        {win.next && win.cur ? <span className="hl">{win.next.w}</span> : ' '}
      </div>
    </div>
  )
}

const SPARKLE =
  'M0,-1 C0.1,-0.1 0.1,-0.1 1,0 C0.1,0.1 0.1,0.1 0,1 C-0.1,0.1 -0.1,0.1 -1,0 C-0.1,-0.1 -0.1,-0.1 0,-1 Z'

// A point of the 1600x900 sky, as a CSS offset from the centre of the screen. --u is one
// sky unit in pixels (set in CSS to match the SVG's "meet" fit), so HTML layers line up
// with the stars exactly.
const skyOffset = (x, y) =>
  `translate(calc(${(x - VIEW.w / 2).toFixed(1)} * var(--u)), calc(${(y - VIEW.h / 2).toFixed(1)} * var(--u)))`

/**
 * Faint background stars, fixed per song. They are drawn once into three layers that each
 * fade in and out at their own pace, so the field twinkles without a single star being
 * repainted; the whole field drifts as one layer.
 */
function Starfield({ seed }) {
  const groups = useMemo(() => {
    const g = [[], [], []]
    for (let i = 0; i < 140; i++)
      g[i % 3].push({
        x: rand(seed + i * 3) * VIEW.w,
        y: rand(seed + i * 5 + 1) * VIEW.h,
        r: 0.6 + rand(seed + i * 11 + 2) * 1.5,
        o: 0.2 + rand(seed + i * 19 + 4) * 0.55
      })
    return g
  }, [seed])
  return (
    <div className="starfield">
      {groups.map((dots, k) => (
        <svg
          key={k}
          className={`sky sky-field tw${k}`}
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          preserveAspectRatio="xMidYMid slice"
        >
          {dots.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.r} opacity={p.o} />
          ))}
        </svg>
      ))}
    </div>
  )
}

const r3 = (m) => (m === 1 ? 6 : m === 2 ? 4.8 : 3.8)

/**
 * One figure as the words have built it so far. Nothing is drawn ahead of the song: a star
 * appears with its word, and the line to it draws itself out from the star before. When the
 * verse's last word lands, any stars the verse had no words for light in a short cascade so
 * the figure is whole. Words sit outside the shape (placeLabels) and never move once placed.
 *
 * The figure is an SVG that only redraws when a word arrives. Everything that moves all the
 * time (the camera leaning toward the newest stars, the sparkle gliding between them) is an
 * HTML layer over it that the compositor moves, so the stars are never repainted for it.
 */
function FigureView({ sky, labelPx, gone }) {
  const placed = useMemo(() => placeLabels(sky.stars, { fontPx: labelPx }), [sky, labelPx])
  const words = sky.stars.filter((s) => s.word).length
  const complete = words > 0 && sky.stars.every((s) => !s.word || s.lit)
  const shown = (s) => s.lit || (complete && !s.word)
  // Wordless stars complete the figure one after another.
  const delay = (i) => (sky.stars[i].word ? 0 : 0.25 + (i - words) * 0.14)
  const lit = sky.stars.filter((s) => s.lit)
  const top = Math.max(-1, ...lit.map((s) => s.line ?? -1))
  // The newest star, or the focus while a word is being sung.
  let last = -1
  sky.stars.forEach((s, i) => {
    if (s.lit) last = i
  })
  const f = sky.focus || (last >= 0 ? { ...sky.stars[last], idle: true } : null)
  // The view leans gently toward the part of the figure being built.
  const lx = lit.length ? lit.reduce((a, s) => a + s.x, 0) / lit.length : VIEW.w / 2
  const ly = lit.length ? lit.reduce((a, s) => a + s.y, 0) / lit.length : 450
  const cam = {
    x: Math.max(-110, Math.min(110, (VIEW.w / 2 - lx) * 0.3)),
    y: Math.max(-40, Math.min(40, (450 - ly) * 0.25))
  }
  const edges = sky.edges
    .map((e, i) => {
      const [a, b] = e.a < e.b ? [e.a, e.b] : [e.b, e.a] // draw from the earlier star
      if (!shown(sky.stars[a]) || !shown(sky.stars[b])) return null
      const p = sky.stars[a]
      const q = sky.stars[b]
      return { a, b, i, d: `M${p.x} ${p.y}L${q.x} ${q.y}` }
    })
    .filter(Boolean)
  return (
    <div
      className={`fig ${gone ? 'gone' : ''} ${complete ? 'complete' : ''}`}
      style={{ transform: skyOffset(VIEW.w / 2 + cam.x, VIEW.h / 2 + cam.y) }}
    >
      <svg className="sky" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet">
        {/* a soft wide stroke under each line stands in for a blur filter */}
        {edges.map((e) => (
          <path
            key={`g${e.a}-${e.b}-${e.i}`}
            className="sky-edge glow"
            d={e.d}
            pathLength="1"
            style={{ '--d': `${delay(e.b) + 0.08}s` }}
          />
        ))}
        {edges.map((e) => (
          <path
            key={`e${e.a}-${e.b}-${e.i}`}
            className="sky-edge"
            d={e.d}
            pathLength="1"
            style={{ '--d': `${delay(e.b) + 0.08}s` }}
          />
        ))}
        {sky.stars.map((s, i) => {
          if (!shown(s)) return null
          const r = r3(s.m)
          return (
            <g
              key={`s${i}`}
              className={`star lit ${s.current ? 'cur' : ''}`}
              style={{ '--d': `${delay(i)}s` }}
            >
              <circle className="halo" cx={s.x} cy={s.y} r={r * 2.8} />
              <circle className="core" cx={s.x} cy={s.y} r={r} />
            </g>
          )
        })}
      </svg>
      {/* Words are HTML, each on its own layer: they arrive large and glowing, then settle
          beside their star, all by scale and opacity, so the sky itself never repaints. */}
      {sky.stars.map((s, i) => {
        const at = placed.get(i)
        if (!at) return null
        const age = s.current ? 'cur' : s.line === top ? 'l0' : s.line === top - 1 ? 'l1' : 'l2'
        return (
          <div
            key={`w${i}`}
            className={`sky-word ${age} a-${at.anchor}`}
            style={{ transform: skyOffset(at.x, at.y) }}
          >
            <span data-w={s.word}>{s.word}</span>
          </div>
        )
      })}
      {f && !gone && (
        <div className={`focus ${f.idle ? 'idle' : ''}`} style={{ transform: skyOffset(f.x, f.y) }}>
          <svg viewBox="-40 -40 80 80">
            <circle key={last} className="ring" r={26} />
            <path className="spark" d={SPARKLE} transform="scale(19)" />
          </svg>
        </div>
      )}
    </div>
  )
}

/**
 * The constellation style: a real figure built by the words, with the whole line as a
 * steady caption underneath. When a verse moves to a new figure the finished one fades
 * while the next begins, rather than being swapped out.
 */
function Constellation({ sky, scale }) {
  const fig = sky?.figure ? sky : null
  const leaving = useHandoff(fig?.figure.n, fig)
  const f = fig?.focus
  const capLine = fig?.stars.find((s) => s.current)?.line
  // The caption changes once per line, not once per word, so it never flickers.
  const { prev: leavingCap } = useSwap(f ? `${capLine}|${f.text}` : 'none', f?.text || '')
  // The size a word settles at (sky units); the word being sung is drawn larger still.
  const labelPx = Math.round(28 * Math.min(1.2, Math.max(0.85, scale)))
  const len = f?.text.length || 0
  const capEm = len <= 22 ? 1 : len <= 38 ? 0.82 : len <= 60 ? 0.68 : 0.56
  const figures = [leaving, fig].filter((s, i, a) => s && a.indexOf(s) === i)
  return (
    <>
      <div className="sky-drift" style={{ '--wpx': labelPx }}>
        {figures.map((s) => (
          <FigureView key={s.figure.n} sky={s} labelPx={labelPx} gone={s === leaving} />
        ))}
      </div>
      <div
        className="sky-caption"
        style={{ '--cap': `calc(min(4.6vw, 8.5vh) * ${scale * capEm})` }}
      >
        {leavingCap && (
          <div key={`l${leavingCap.key}`} className="cap leave">
            {leavingCap.value}
          </div>
        )}
        {f && (
          <div key={`c${capLine}|${f.text}`} className="cap">
            {f.text}
          </div>
        )}
      </div>
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
  const STYLES = ['stack', 'karaoke', 'constellation', 'aura', 'waves', 'beat', 'messages']
  const style = STYLES.includes(l?.style) ? l.style : 'stack'
  // Word-timed lyrics go word by word. Line-timed lyrics show whole lines unless the
  // listener asked for estimated words.
  const mode = state?.lyricsTiming === 'word' || l?.estimated === 'words' ? 'words' : 'lines'
  const seed = seedOf(state?.track?.id)
  const opts = useMemo(
    () =>
      // Constellation always lights its stars word by word, like the original; the
      // caption carries the whole line.
      style === 'constellation' ? { mode: 'words', seed, captionLine: true } : { mode, seed },
    [mode, seed, style]
  )
  // Step aside while Glowtide's own window is in use, so the overlay never covers its controls.
  const active =
    state?.lyricsStatus === 'synced' &&
    lyrics.length > 0 &&
    !!state?.playback?.isPlaying &&
    !state?.playerFocused
  // Hidden (paused, Glowtide in front, no lyrics): once it has faded out, nothing in the overlay
  // runs at all, so an idle overlay costs nothing.
  const live = useLinger(!!active, 1200)
  const fps = settings?.fps === 60 ? 60 : 30
  useFrameRateCap(fps)
  const win = useLyricView(
    style === 'constellation'
      ? skyView
      : style === 'waves'
        ? wavesView
        : style === 'karaoke'
          ? karaokeView
          : style === 'messages'
            ? messagesView
            : stackView,
    lyrics,
    state?.playback,
    state?.track?.durationMs,
    state?.lyricsOffsetMs,
    opts,
    live
  )
  const now = useClock()
  const beatRef = useRef(null)
  // Music energy for Aura, Waves and Beat (and nothing is listened to otherwise).
  useBeatVars(beatRef, {
    playing: ['aura', 'waves', 'beat'].includes(style) && !!active,
    fps,
    listen: !!settings && listensToMusic(settings.glow)
  })

  if (!state || !settings || !colours) return null
  const scale = l.size / 100
  const measured = state.lyricsTiming === 'word' && mode === 'words'

  return (
    <div
      className={`lyr s-${style} ${settings.colour.fade ? 'fade' : ''} ${l.context ? '' : 'solo'} ${state.lyricsOverStage ? 'over-stage' : ''}`}
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
        {live && (
          <>
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
            {style === 'karaoke' && (
              <Karaoke
                view={win && 'countdown' in win ? win : null}
                playback={state.playback}
                durationMs={state.track?.durationMs}
                offsetMs={state.lyricsOffsetMs}
                showNext={!!l.context}
                colour={karaokeColour(colours.highlight)}
                fps={fps}
              />
            )}
            {style === 'aura' && (
              <Aura win={win && 'cur' in win ? win : null} mode={mode} beatRef={beatRef} />
            )}
            {style === 'waves' && (
              <Waves view={win && 'words' in win ? win : null} beatRef={beatRef} />
            )}
            {style === 'beat' && (
              <Beat win={win && 'cur' in win ? win : null} mode={mode} beatRef={beatRef} />
            )}
            {style === 'messages' && <Messages view={win?.chat ? win : null} />}
            {style === 'constellation' && (
              <>
                <Starfield seed={seed} />
                <Constellation sky={win?.stars ? win : null} scale={scale} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

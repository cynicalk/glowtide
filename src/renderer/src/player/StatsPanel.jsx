// Stats: what you've been listening to, from the history Glowtide keeps on this PC. Time
// listened by day (or month), your top songs and artists, and a card to share.

import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/store'
import { Seg, Toggle } from './SettingsPanel'
import {
  CARD_SIZES,
  YEAR_SLIDES,
  drawCard,
  drawStatsCard,
  drawYearSlide,
  recordClip
} from './shareCard'
import { RANGES, formatListening } from '../../../shared/stats.mjs'

const RANGE_OPTIONS = Object.keys(RANGES).map((k) => [k, RANGES[k].label])

/** The range's stats, refreshed when the song changes and every 30 s while open. */
function useStats(range, trackId) {
  const [res, setRes] = useState({ range: null, data: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    let alive = true
    api.stats(range).then((data) => alive && setRes({ range, data }))
    return () => {
      alive = false
    }
  }, [range, trackId, tick])
  return [res.range === range ? res.data : null, () => setTick((n) => n + 1)]
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function StatsPanel({ state, settings }) {
  const [range, setRange] = useState('week')
  const [data, refresh] = useStats(range, state.track?.id)
  const [carding, setCarding] = useState(false)
  const [lineCard, setLineCard] = useState(null) // a starred line being made into a card
  const [yearView, setYearView] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const on = settings.history !== false

  if (carding && data) return <StatsCard data={data} onClose={() => setCarding(false)} />
  if (lineCard) return <LineCard fav={lineCard} onClose={() => setLineCard(null)} />
  if (yearView) return <YearView onClose={() => setYearView(false)} />
  const year = new Date().getFullYear()
  // the year's recap is offered on the year view, and through December and early January
  const month = new Date().getMonth()
  const yearOffer = range === 'year' || month === 11

  return (
    <div className="stats">
      <div className="stats-head">
        <Seg value={range} options={RANGE_OPTIONS} onChange={setRange} />
        <span className="stats-confirm">
          {data?.plays > 0 && yearOffer && (
            <button className="pill on" onClick={() => setYearView(true)}>
              Your {year} in music
            </button>
          )}
          {data?.plays > 0 && (
            <button className="pill" onClick={() => setCarding(true)}>
              Share a card
            </button>
          )}
        </span>
      </div>
      {!data ? (
        <div className="muted pad">Loading…</div>
      ) : data.plays === 0 ? (
        <p className="muted pad">
          {on
            ? 'Nothing here yet. A song counts once you’ve listened to it for 30 seconds, from any app, Spotify or YouTube Music (the demo’s songs don’t count).'
            : 'Listening history is off, so nothing is being counted. Turn it on below.'}
        </p>
      ) : (
        <>
          <Tiles data={data} />
          {data.onThisDay?.length > 0 && <OnThisDay items={data.onThisDay} />}
          <Bars data={data} />
          <div className="stats-lists">
            <section>
              <div className="sect">Top songs</div>
              {data.topSongs.map((s, i) => (
                <div className="row stats-row" key={s.key}>
                  <span className="stats-rank">{i + 1}</span>
                  {s.cover ? <img src={s.cover} alt="" /> : <div className="thumb-ph" />}
                  <div className="row-text">
                    <div className="t">{s.title}</div>
                    <div className="s">{s.artist}</div>
                  </div>
                  <span className="stats-count">{plural(s.plays, 'play')}</span>
                </div>
              ))}
            </section>
            <section>
              <div className="sect">Top artists</div>
              {data.topArtists.map((a, i) => (
                <div className="row stats-row" key={a.artist}>
                  <span className="stats-rank">{i + 1}</span>
                  <div className="row-text">
                    <div className="t">{a.artist}</div>
                    <div className="s">{formatListening(a.ms)}</div>
                  </div>
                  <span className="stats-count">{plural(a.plays, 'play')}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
      <FavLines onCard={setLineCard} />
      <div className="stats-foot">
        <div className="srow">
          <span>Keep a listening history</span>
          <Toggle
            label="Keep a listening history"
            on={on}
            onChange={(v) => api.setSettings({ history: v })}
          />
        </div>
        <p className="fine">
          Kept only on this PC, in Glowtide’s settings folder. Nothing is sent anywhere.
        </p>
        <div className="srow">
          <span>Weekly recap</span>
          <Toggle
            label="A notification with your week in music on Sunday evening"
            on={settings.recap !== false}
            onChange={(v) => api.setSettings({ recap: v })}
          />
        </div>
        <p className="fine">
          On Sunday evening, a notification with your week: time listened and your top song.
        </p>
        <div className="srow">
          <span>Clear the history</span>
          {confirm ? (
            <span className="stats-confirm">
              <button
                className="pill on"
                onClick={async () => {
                  await api.clearHistory()
                  setConfirm(false)
                  refresh()
                }}
              >
                Clear everything
              </button>
              <button className="pill" onClick={() => setConfirm(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button className="pill" onClick={() => setConfirm(true)}>
              Clear…
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** A song you played a lot this time last month or last year. */
function OnThisDay({ items }) {
  return (
    <div className="stats-otd">
      {items.map((x) => (
        <div className="row stats-row" key={x.when}>
          {x.cover ? <img src={x.cover} alt="" /> : <div className="thumb-ph" />}
          <div className="row-text">
            <div className="k">{x.label}</div>
            <div className="t">{x.title}</div>
            <div className="s">
              {x.artist ? `${x.artist} · ` : ''}
              {plural(x.plays, 'play')} that week
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The headline numbers. */
function Tiles({ data }) {
  const prevName = RANGES[data.range].previous
  let change = null
  if (data.previous && prevName) {
    const d = data.ms - data.previous.ms
    change =
      Math.abs(d) < 60000
        ? `about the same as ${prevName}`
        : `${formatListening(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than ${prevName}`
  }
  const top = data.topArtists[0]
  return (
    <div className="stats-tiles">
      <div className="stats-tile">
        <div className="k">Time listened</div>
        <div className="v">{formatListening(data.ms)}</div>
        {change && <div className="d">{change}</div>}
      </div>
      <div className="stats-tile">
        <div className="k">Plays</div>
        <div className="v">{data.plays}</div>
        <div className="d">{plural(data.songs, 'different song')}</div>
      </div>
      {top && (
        <div className="stats-tile">
          <div className="k">Top artist</div>
          <div className="v name">{top.artist}</div>
          <div className="d">{plural(top.plays, 'play')}</div>
        </div>
      )}
    </div>
  )
}

/**
 * Time listened per day (a week or month) or per month (a year, all time). One series in
 * the accent colour; a day with nothing played has no bar (not a sliver standing for zero).
 * Pointing at a bar reads it out above the chart.
 */
function Bars({ data }) {
  const [at, setAt] = useState(null)
  const max = Math.max(...data.buckets.map((b) => b.ms), 1)
  const n = data.buckets.length
  const labelEvery = n <= 13 ? 1 : 5
  const b = at !== null ? data.buckets[at] : null
  const unit = data.range === 'week' || data.range === 'month' ? 'day' : 'month'
  return (
    <div className="stats-chart">
      <div className="stats-read">
        {b ? (
          <>
            <b>{b.long}</b> · {b.ms ? formatListening(b.ms) : 'nothing played'}
            {b.plays > 0 && ` · ${plural(b.plays, 'play')}`}
          </>
        ) : (
          `Time listened each ${unit}`
        )}
      </div>
      <div className="stats-bars" onMouseLeave={() => setAt(null)}>
        {data.buckets.map((x, i) => (
          <div
            key={x.start}
            className={`stats-slot ${at === i ? 'on' : ''}`}
            onMouseEnter={() => setAt(i)}
            aria-label={`${x.long}: ${x.ms ? formatListening(x.ms) : 'nothing played'}`}
            role="img"
          >
            {x.ms > 0 && <i style={{ height: `${Math.max(2, (x.ms / max) * 100)}%` }} />}
          </div>
        ))}
      </div>
      <div className="stats-axis">
        {data.buckets.map((x, i) => (
          <span key={x.start}>{i % labelEvery === 0 || i === n - 1 ? x.label : ''}</span>
        ))}
      </div>
    </div>
  )
}

/** The card: drawn at full size, copied or saved as a PNG. */
function StatsCard({ data, onClose }) {
  const canvas = useRef(null)
  const [covers, setCovers] = useState([])
  const [note, setNote] = useState('')
  const songs = data.topSongs.slice(0, 5)
  useEffect(() => {
    let live = true
    Promise.all(
      songs.map((s) =>
        s.cover
          ? api.cardCover(s.cover).then(
              (url) =>
                url &&
                new Promise((res) => {
                  const img = new Image()
                  img.onload = () => res(img)
                  img.onerror = () => res(null)
                  img.src = url
                })
            )
          : null
      )
    ).then((imgs) => live && setCovers(imgs))
    return () => {
      live = false
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (canvas.current) drawStatsCard(canvas.current, { data, covers })
  }, [data, covers])
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const png = () => canvas.current.toDataURL('image/png')
  return (
    <div className="stats card-maker">
      <div className="tap-head">
        <div className="tap-title">{RANGES[data.range].title}</div>
        <div className="tap-actions">
          <button
            className="pill on"
            onClick={async () => setNote((await api.copyCard(png())) ? 'Copied' : "Couldn't copy")}
          >
            Copy image
          </button>
          <button
            className="pill"
            onClick={async () =>
              setNote((await api.saveCard(png(), RANGES[data.range].title)) ? 'Saved' : '')
            }
          >
            Save…
          </button>
          <button className="pill" onClick={onClose}>
            Back
          </button>
        </div>
        <div className="tap-sub">{note || 'A picture of your listening, to share'}</div>
      </div>
      <div className="card-body">
        <canvas ref={canvas} className="card-preview story" />
      </div>
    </div>
  )
}

/** A picture (https or inline) as an Image for a canvas, through Glowtide's cover fetch. */
function loadCover(url) {
  if (!url) return Promise.resolve(null)
  return api.cardCover(url).then(
    (data) =>
      data &&
      new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = () => res(null)
        img.src = data
      })
  )
}

/** The lines you starred, newest first: each can become a card or a clip. */
function FavLines({ onCard }) {
  const [list, setList] = useState(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    let live = true
    api.allFavs().then((l) => live && setList(l || []))
    return () => {
      live = false
    }
  }, [])
  if (!list) return null
  const shown = all ? list : list.slice(0, 5)
  return (
    <section className="stats-favs">
      <div className="sect">Favourite lines</div>
      {!list.length ? (
        <p className="fine">
          Star a line in the lyrics view (☆ beside the line being sung) to keep it here.
        </p>
      ) : (
        <>
          {shown.map((f) => (
            <div className="stats-fav" key={`${f.key}\n${f.text}`}>
              <div className="row-text">
                <div className="q">“{f.text}”</div>
                <div className="s">
                  {f.title}
                  {f.artist ? ` · ${f.artist}` : ''}
                </div>
              </div>
              <button className="pill" onClick={() => onCard(f)}>
                Share
              </button>
              <button
                className="rd sm ghost"
                aria-label="Unstar this line"
                onClick={async () => setList(await api.removeFav(f.key, f.text))}
              >
                ★
              </button>
            </div>
          ))}
          {list.length > 5 && (
            <button className="pill" onClick={() => setAll(!all)}>
              {all ? 'Fewer' : `All ${list.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/** A starred line as a card (story or square) or an 8-second clip. */
function LineCard({ fav, onClose }) {
  const canvas = useRef(null)
  const [size, setSize] = useState('story')
  const [cover, setCover] = useState(null)
  const [note, setNote] = useState('')
  const [rec, setRec] = useState(null)
  const [redraw, setRedraw] = useState(0)
  const open = useRef(true)
  useEffect(
    () => () => {
      open.current = false
    },
    []
  )
  useEffect(() => {
    let live = true
    loadCover(fav.cover).then((img) => live && setCover(img))
    return () => {
      live = false
    }
  }, [fav.cover])
  const info = { cover, line: fav.text, title: fav.title, artist: fav.artist.split(',')[0] }
  useEffect(() => {
    if (canvas.current && rec === null) drawCard(canvas.current, { size, ...info })
  }, [size, cover, redraw]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const name = `${info.artist} - ${fav.title || 'Glowtide'}`
  const png = () => canvas.current.toDataURL('image/png')
  const clip = async () => {
    setNote('')
    const r = await recordClip(
      canvas.current,
      { size, ...info },
      { onSecond: setRec, open: () => open.current }
    )
    if (!r) return
    setRec(null)
    setRedraw((n) => n + 1)
    if (r.error) return setNote(r.error)
    setNote((await api.saveClip(r.bytes, name, r.ext)) ? 'Clip saved' : '')
  }
  return (
    <div className="stats card-maker">
      <div className="tap-head">
        <div className="tap-title">A line you loved</div>
        <div className="tap-actions">
          <Seg
            value={size}
            options={Object.keys(CARD_SIZES).map((k) => [k, CARD_SIZES[k].label])}
            onChange={setSize}
          />
          <button
            className="pill on"
            disabled={rec !== null}
            onClick={async () => setNote((await api.copyCard(png())) ? 'Copied' : "Couldn't copy")}
          >
            Copy image
          </button>
          <button
            className="pill"
            disabled={rec !== null}
            onClick={async () => setNote((await api.saveCard(png(), name)) ? 'Saved' : '')}
          >
            Save…
          </button>
          <button className="pill" disabled={rec !== null} onClick={clip}>
            {rec !== null ? `Recording… ${rec} s` : 'Make a clip…'}
          </button>
          <button className="pill" onClick={onClose}>
            Back
          </button>
        </div>
        <div className="tap-sub">
          {note || `${fav.title}${fav.artist ? ` · ${fav.artist}` : ''}`}
        </div>
      </div>
      <div className="card-body">
        <canvas ref={canvas} className={`card-preview ${size}`} />
      </div>
    </div>
  )
}

/** Your year in music: a few story slides to flick through, copy or save. */
function YearView({ onClose }) {
  const year = new Date().getFullYear()
  const canvas = useRef(null)
  const [res, setRes] = useState(undefined)
  const [covers, setCovers] = useState([])
  const [favCover, setFavCover] = useState(null)
  const [i, setI] = useState(0)
  const [note, setNote] = useState('')
  useEffect(() => {
    let live = true
    api.yearInMusic(year).then(async (r) => {
      if (!live) return
      setRes(r)
      if (!r) return
      const imgs = await Promise.all((r.covers || []).map(loadCover))
      const fc = r.fav ? await loadCover(r.fav.cover) : null
      if (live) {
        setCovers(imgs)
        setFavCover(fc)
      }
    })
    return () => {
      live = false
    }
  }, [year])
  const slides = res ? YEAR_SLIDES.filter((s) => s !== 'line' || res.fav) : []
  const slide = slides[Math.min(i, slides.length - 1)]
  useEffect(() => {
    if (canvas.current && res && slide)
      drawYearSlide(canvas.current, { slide, y: res.y, covers, fav: res.fav, favCover })
  }, [res, slide, covers, favCover])
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, slides.length - 1))
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, slides.length])
  const png = () => canvas.current.toDataURL('image/png')
  const name = `My ${year} in music ${i + 1}`
  return (
    <div className="stats card-maker">
      <div className="tap-head">
        <div className="tap-title">Your {year} in music</div>
        <div className="tap-actions">
          <button
            className="pill"
            disabled={i === 0}
            onClick={() => setI(i - 1)}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <span className="muted">{slides.length ? `${i + 1} of ${slides.length}` : ''}</span>
          <button
            className="pill"
            disabled={i >= slides.length - 1}
            onClick={() => setI(i + 1)}
            aria-label="Next slide"
          >
            ›
          </button>
          <button
            className="pill on"
            disabled={!res}
            onClick={async () => setNote((await api.copyCard(png())) ? 'Copied' : "Couldn't copy")}
          >
            Copy image
          </button>
          <button
            className="pill"
            disabled={!res}
            onClick={async () => setNote((await api.saveCard(png(), name)) ? 'Saved' : '')}
          >
            Save…
          </button>
          <button className="pill" onClick={onClose}>
            Back
          </button>
        </div>
        <div className="tap-sub">
          {note ||
            (res === undefined
              ? 'Loading…'
              : res === null
                ? `Nothing played in ${year} yet.`
                : 'Flick through with ‹ › or the arrow keys')}
        </div>
      </div>
      {res && (
        <div className="card-body">
          <canvas ref={canvas} className="card-preview story" />
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ChevronLeft, ListPlus, Play, Laptop, Smartphone, Speaker, Tv } from 'lucide-react'
import { api } from '../lib/store'

/** undefined while loading; results are keyed so a changed request never shows stale data. */
function useQuery(kind, arg, deps = []) {
  const key = JSON.stringify([kind, arg, ...deps])
  const [res, setRes] = useState({ key: null, data: undefined })
  useEffect(() => {
    let alive = true
    api.query(kind, arg).then((data) => alive && setRes({ key, data }))
    return () => {
      alive = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return res.key === key ? res.data : undefined
}

function Loading() {
  return <div className="muted pad">Loading…</div>
}
function Problem({ msg }) {
  return <div className="error">{msg}</div>
}

const imgOf = (x) =>
  x?.album?.images?.at(-1)?.url || x?.images?.at(-1)?.url || x?.images?.[0]?.url || x?.thumb

function Row({ thumb, title, sub, onPlay, onQueue, active }) {
  return (
    <div className={`row ${active ? 'active' : ''}`} onDoubleClick={onPlay}>
      {thumb ? <img src={thumb} alt="" /> : <div className="thumb-ph" />}
      <div className="row-text" onClick={onPlay} role="button" tabIndex={0}>
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      {onQueue && (
        <button className="rd sm ghost" aria-label="Add to queue" onClick={onQueue}>
          <ListPlus size={13} />
        </button>
      )}
    </div>
  )
}

const artistsOf = (t) => (t.artists || []).map((a) => a.name).join(', ')

function DemoLibrary({ state }) {
  const tracks = useQuery('demoTracks', null, [])
  if (!tracks) return <Loading />
  return (
    <>
      <div className="muted pad">
        Demo tracks. Connect Spotify in Settings for your real library.
      </div>
      {tracks.map((t, i) => (
        <Row
          key={t.id}
          thumb={t.thumb}
          title={t.name}
          sub={t.artists}
          active={state.track?.id === t.id}
          onPlay={() => api.control('playIndex', i)}
        />
      ))}
    </>
  )
}

export function SearchPanel({ state }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState({ q: '', data: null })
  useEffect(() => {
    const term = q.trim()
    if (!term || state.demo) return
    const id = setTimeout(
      () => api.query('search', term).then((data) => setFound({ q: term, data })),
      350
    )
    return () => clearTimeout(id)
  }, [q, state.demo])
  const res = q.trim() && found.q ? found.data : null

  if (state.demo)
    return (
      <div className="muted pad">
        Search needs a Spotify connection. Turn off demo mode in Settings.
      </div>
    )
  return (
    <>
      <input
        className="field"
        autoFocus
        placeholder="Songs, albums or playlists"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {res?.error && <Problem msg={res.error} />}
      {res?.tracks?.items?.length > 0 && <div className="sect">Songs</div>}
      {res?.tracks?.items?.map((t) => (
        <Row
          key={t.id}
          thumb={imgOf(t)}
          title={t.name}
          sub={artistsOf(t)}
          active={state.track?.id === t.id}
          onPlay={() => api.control('playItems', { uris: [t.uri] })}
          onQueue={() => api.control('queue', t.uri)}
        />
      ))}
      {res?.albums?.items?.length > 0 && <div className="sect">Albums</div>}
      {res?.albums?.items?.slice(0, 6).map((a) => (
        <Row
          key={a.id}
          thumb={imgOf(a)}
          title={a.name}
          sub={artistsOf(a)}
          onPlay={() => api.control('playItems', { context_uri: a.uri })}
        />
      ))}
      {res?.playlists?.items?.filter(Boolean).length > 0 && <div className="sect">Playlists</div>}
      {res?.playlists?.items
        ?.filter(Boolean)
        .slice(0, 6)
        .map((p) => (
          <Row
            key={p.id}
            thumb={imgOf(p)}
            title={p.name}
            sub={p.owner?.display_name}
            onPlay={() => api.control('playItems', { context_uri: p.uri })}
          />
        ))}
      {res && !res.error && !res.tracks?.items?.length && (
        <div className="muted pad">No matches</div>
      )}
    </>
  )
}

export function LibraryPanel({ state }) {
  const [tab, setTab] = useState('liked')
  const [open, setOpen] = useState(null)
  if (state.demo) return <DemoLibrary state={state} />
  if (open) return <PlaylistView playlist={open} state={state} onBack={() => setOpen(null)} />
  return (
    <>
      <div className="seg">
        {[
          ['liked', 'Liked songs'],
          ['playlists', 'Playlists'],
          ['recent', 'Recent']
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'liked' && <Liked state={state} />}
      {tab === 'playlists' && <Playlists onOpen={setOpen} />}
      {tab === 'recent' && <Recent state={state} />}
    </>
  )
}

function Liked({ state }) {
  const d = useQuery('liked', 0, [])
  if (d === undefined) return <Loading />
  if (d?.error) return <Problem msg={d.error} />
  const items = d.items.map((x) => x.track).filter(Boolean)
  if (!items.length) return <div className="muted pad">No liked songs yet</div>
  const uris = items.map((t) => t.uri)
  return items.map((t, i) => (
    <Row
      key={t.id + i}
      thumb={imgOf(t)}
      title={t.name}
      sub={artistsOf(t)}
      active={state.track?.id === t.id}
      onPlay={() => api.control('playItems', { uris, offset: { position: i } })}
      onQueue={() => api.control('queue', t.uri)}
    />
  ))
}

function Playlists({ onOpen }) {
  const d = useQuery('playlists', 0, [])
  if (d === undefined) return <Loading />
  if (d?.error) return <Problem msg={d.error} />
  const items = (d.items || []).filter(Boolean)
  if (!items.length) return <div className="muted pad">No playlists</div>
  return items.map((p) => (
    <Row
      key={p.id}
      thumb={imgOf(p)}
      title={p.name}
      sub={p.owner?.display_name}
      onPlay={() => onOpen(p)}
    />
  ))
}

function PlaylistView({ playlist, state, onBack }) {
  const d = useQuery('playlistTracks', playlist.id, [playlist.id])
  return (
    <>
      <div className="pl-head">
        <button className="rd sm" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={14} />
        </button>
        <span className="t">{playlist.name}</span>
        <button
          className="pill"
          onClick={() => api.control('playItems', { context_uri: playlist.uri })}
        >
          <Play size={12} /> Play
        </button>
      </div>
      {d === undefined && <Loading />}
      {d?.error && <Problem msg={d.error} />}
      {d?.items
        ?.map((x) => x.track || x.item)
        .filter((t) => t?.uri)
        .map((t, i) => (
          <Row
            key={t.uri + i}
            thumb={imgOf(t)}
            title={t.name}
            sub={artistsOf(t)}
            active={state.track?.id === t.id}
            onPlay={() =>
              api.control('playItems', { context_uri: playlist.uri, offset: { uri: t.uri } })
            }
            onQueue={() => api.control('queue', t.uri)}
          />
        ))}
    </>
  )
}

function Recent({ state }) {
  const d = useQuery('recent', null, [])
  if (d === undefined) return <Loading />
  if (d?.error) return <Problem msg={d.error} />
  const seen = new Set()
  const items = (d.items || [])
    .map((x) => x.track)
    .filter((t) => t && !seen.has(t.id) && seen.add(t.id))
  return items.map((t) => (
    <Row
      key={t.id}
      thumb={imgOf(t)}
      title={t.name}
      sub={artistsOf(t)}
      active={state.track?.id === t.id}
      onPlay={() => api.control('playItems', { uris: [t.uri] })}
      onQueue={() => api.control('queue', t.uri)}
    />
  ))
}

export function QueuePanel({ state }) {
  const d = useQuery('queue', null, [state.track?.id])
  if (state.demo) return <DemoLibrary state={state} />
  if (d === undefined) return <Loading />
  if (d?.error) return <Problem msg={d.error} />
  const q = (d?.queue || []).filter(Boolean)
  return (
    <>
      {d?.currently_playing && (
        <>
          <div className="sect">Now playing</div>
          <Row
            thumb={imgOf(d.currently_playing)}
            title={d.currently_playing.name}
            sub={artistsOf(d.currently_playing)}
            active
          />
        </>
      )}
      <div className="sect">Next up</div>
      {q.length ? (
        q.map((t, i) => <Row key={t.uri + i} thumb={imgOf(t)} title={t.name} sub={artistsOf(t)} />)
      ) : (
        <div className="muted pad">Queue is empty</div>
      )}
    </>
  )
}

const DEVICE_ICON = { Computer: Laptop, Smartphone, Speaker, TV: Tv }

export function DevicesPanel({ state }) {
  const [n, setN] = useState(0)
  const d = useQuery('devices', null, [n])
  if (state.demo) return <div className="muted pad">Devices appear once Spotify is connected.</div>
  if (d === undefined) return <Loading />
  if (d?.error) return <Problem msg={d.error} />
  const list = d?.devices || []
  return (
    <>
      {!list.length && (
        <div className="muted pad">No devices found. Open Spotify on this PC, then refresh.</div>
      )}
      {list.map((dev) => {
        const Icon = DEVICE_ICON[dev.type] || Speaker
        return (
          <div
            key={dev.id}
            className={`row device ${dev.is_active ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() =>
              api.control('transfer', dev.id).then(() => setTimeout(() => setN((x) => x + 1), 600))
            }
          >
            <Icon size={18} />
            <div className="row-text">
              <div className="t">{dev.name}</div>
              <div className="s">{dev.is_active ? 'Playing here' : dev.type}</div>
            </div>
          </div>
        )
      })}
      <button className="link" onClick={() => setN((x) => x + 1)}>
        Refresh
      </button>
    </>
  )
}

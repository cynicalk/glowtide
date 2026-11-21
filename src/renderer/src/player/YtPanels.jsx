import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Play, Link2, ExternalLink } from 'lucide-react'
import { api } from '../lib/store'
import { parseYouTubeLink } from '../../../shared/youtube.mjs'

function useQuery(kind, arg) {
  const key = JSON.stringify([kind, arg])
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

function Row({ v, active, onPlay }) {
  return (
    <div className={`row ${active ? 'active' : ''}`}>
      <img src={v.thumb} alt="" className="wide" />
      <div className="row-text" onClick={onPlay} role="button" tabIndex={0}>
        <div className="t">{v.name}</div>
        <div className="s">{v.artists}</div>
      </div>
    </div>
  )
}

function TrackList({ items, state }) {
  if (!items.length) return <div className="muted pad">Nothing here</div>
  return items.map((v, i) => (
    <Row
      key={v.videoId + i}
      v={v}
      active={state.track?.id === v.id}
      onPlay={() => api.control('playItems', { items, index: i })}
    />
  ))
}

/** Paste a YouTube / YouTube Music link: works with no sign-in at all. */
export function PasteLink() {
  const [text, setText] = useState('')
  const [err, setErr] = useState(null)
  const go = () => {
    const link = parseYouTubeLink(text)
    if (!link) {
      setErr('Paste a YouTube or YouTube Music link to a song or playlist.')
      return
    }
    setErr(null)
    api.control('playItems', {
      items: link.videoId ? [{ videoId: link.videoId }] : undefined,
      playlistId: link.playlistId
    })
    setText('')
  }
  return (
    <div className="paste">
      <div className="paste-row">
        <input
          className="field"
          placeholder="music.youtube.com/watch?v=…"
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            setErr(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <button className="pill" onClick={go}>
          <Link2 size={13} /> Play
        </button>
      </div>
      {err && <div className="error">{err}</div>}
    </div>
  )
}

export function GoogleSetup({ settings }) {
  const [id, setId] = useState(settings.googleClientId)
  const [secret, setSecret] = useState(settings.googleClientSecret)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const attempt = useRef(0) // a click while waiting starts again; only the latest one counts
  const connect = async () => {
    if (!/\.apps\.googleusercontent\.com$/.test(id.trim())) {
      setErr('A Google Client ID ends in .apps.googleusercontent.com')
      return
    }
    if (!secret.trim()) {
      setErr('Paste the client secret too. Google shows it next to the Client ID.')
      return
    }
    setErr(null)
    setBusy(true)
    const mine = ++attempt.current
    await api.setSettings({ googleClientId: id.trim(), googleClientSecret: secret.trim() })
    const r = await api.googleConnect()
    if (mine !== attempt.current) return
    setBusy(false)
    if (r?.error) setErr(r.error)
  }
  return (
    <div className="gsetup">
      <p className="fine">
        Your playlists and liked music come from YouTube’s official API. It’s free, but Google asks
        each app for its own key. This is a one-time setup and takes about 5 minutes:
      </p>
      <ol className="steps">
        <li>
          <span>
            In Google Cloud, create a project and turn on <b>YouTube Data API v3</b>.
          </span>
          <button
            className="pill"
            onClick={() =>
              api.open('https://console.cloud.google.com/apis/library/youtube.googleapis.com')
            }
          >
            <ExternalLink size={13} /> Open Google Cloud
          </button>
        </li>
        <li>
          <span>
            Under <b>Google Auth Platform</b> (the OAuth consent screen), choose <b>External</b>.
            Then in <b>Audience → Test users</b>, add the Gmail address you’ll sign in with. Without
            it, Google blocks the sign-in and says the app “can only be accessed by
            developer-approved testers”.
          </span>
        </li>
        <li>
          <span>
            Under Credentials, create an <b>OAuth client ID</b> of type <b>Desktop app</b>, then
            paste it here:
          </span>
          <input
            className="field"
            placeholder="1234-abc.apps.googleusercontent.com"
            value={id}
            spellCheck={false}
            onChange={(e) => setId(e.target.value)}
          />
          <input
            className="field"
            placeholder="Client secret"
            value={secret}
            spellCheck={false}
            onChange={(e) => setSecret(e.target.value)}
          />
        </li>
      </ol>
      {err && <div className="error">{err}</div>}
      <button className="primary small" onClick={connect}>
        {busy ? 'Waiting for Google… (click to start again)' : 'Sign in with Google'}
      </button>
      {busy && (
        <p className="fine">
          If Google showed an error instead of a sign-in page, check the Client ID and that your
          Gmail is added as a test user, then click again.
        </p>
      )}
      <p className="fine">Glowtide only asks to read your YouTube account, never to change it.</p>
      <div className="heads-up">
        <p>
          Rather skip the setup? Play YouTube Music in your browser (Premium works as usual) and
          choose <b>Any app</b>: Glowtide follows it with nothing to set up.
        </p>
        <button className="pill on" onClick={() => api.setSource('system')}>
          Use Any app instead
        </button>
      </div>
    </div>
  )
}

export function YtLibrary({ state, settings }) {
  const [tab, setTab] = useState('liked')
  const [open, setOpen] = useState(null)
  if (open) return <PlaylistView playlist={open} state={state} onBack={() => setOpen(null)} />
  return (
    <>
      <PasteLink />
      {!state.google ? (
        <>
          <div className="sect">Your YouTube Music library</div>
          <GoogleSetup settings={settings} />
        </>
      ) : (
        <>
          <div className="seg">
            {[
              ['liked', 'Liked music'],
              ['playlists', 'Playlists']
            ].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'liked' && <Liked state={state} />}
          {tab === 'playlists' && <Playlists onOpen={setOpen} />}
        </>
      )}
    </>
  )
}

function Liked({ state }) {
  const d = useQuery('ytLiked')
  if (d === undefined) return <div className="muted pad">Loading…</div>
  if (d?.error) return <div className="error">{d.error}</div>
  return (
    <>
      <div className="muted pad">
        Videos you’ve liked that YouTube files under Music. YouTube’s API doesn’t expose the
        separate “Liked music” list.
      </div>
      <TrackList items={d} state={state} />
    </>
  )
}

function Playlists({ onOpen }) {
  const d = useQuery('ytPlaylists')
  if (d === undefined) return <div className="muted pad">Loading…</div>
  if (d?.error) return <div className="error">{d.error}</div>
  if (!d.length) return <div className="muted pad">No playlists on this account</div>
  return d.map((p) => (
    <div key={p.id} className="row">
      {p.thumb ? <img src={p.thumb} alt="" className="wide" /> : <div className="thumb-ph" />}
      <div className="row-text" onClick={() => onOpen(p)} role="button" tabIndex={0}>
        <div className="t">{p.name}</div>
        <div className="s">{p.count != null ? `${p.count} items` : ''}</div>
      </div>
    </div>
  ))
}

function PlaylistView({ playlist, state, onBack }) {
  const d = useQuery('ytPlaylistItems', playlist.id)
  return (
    <>
      <div className="pl-head">
        <button className="rd sm" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={14} />
        </button>
        <span className="t">{playlist.name}</span>
        {Array.isArray(d) && d.length > 0 && (
          <button className="pill" onClick={() => api.control('playItems', { items: d, index: 0 })}>
            <Play size={12} /> Play
          </button>
        )}
      </div>
      {d === undefined && <div className="muted pad">Loading…</div>}
      {d?.error && <div className="error">{d.error}</div>}
      {Array.isArray(d) && <TrackList items={d} state={state} />}
    </>
  )
}

export function YtSearch({ state }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState({ q: '', data: null })
  if (!state.google)
    return (
      <>
        <div className="muted pad">
          Searching YouTube needs Google sign-in (Library → Sign in with Google). You can still
          paste a link:
        </div>
        <PasteLink />
      </>
    )
  const run = () => {
    const term = q.trim()
    if (term) api.query('ytSearch', term).then((data) => setFound({ q: term, data }))
  }
  const res = found.q ? found.data : null
  return (
    <>
      <div className="paste-row">
        <input
          className="field"
          autoFocus
          placeholder="Search songs on YouTube"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <button className="pill" onClick={run}>
          Search
        </button>
      </div>
      <p className="fine">
        Press Enter to search. Each search uses 1% of your project’s free daily YouTube quota.
      </p>
      {res?.error && <div className="error">{res.error}</div>}
      {Array.isArray(res) && <TrackList items={res} state={state} />}
    </>
  )
}

export function YtQueue({ state }) {
  const q = state.ytQueue
  if (!q?.items?.length)
    return (
      <div className="muted pad">Playing a single video. Play a playlist to see what’s next.</div>
    )
  const upcoming = q.items.slice(q.index + 1, q.index + 41)
  return (
    <>
      <div className="sect">
        Track {q.index + 1} of {q.items.length}
      </div>
      {upcoming.map((v, i) => (
        <div key={v.videoId + i} className="row">
          <img src={`https://i.ytimg.com/vi/${v.videoId}/default.jpg`} alt="" className="wide" />
          <div className="row-text">
            {/* Titles of a pasted playlist aren't known until each video loads. */}
            <div className="t">{v.name || `Video ${q.index + i + 2}`}</div>
            <div className="s">{v.artists || 'Title shows when it plays'}</div>
          </div>
        </div>
      ))}
    </>
  )
}

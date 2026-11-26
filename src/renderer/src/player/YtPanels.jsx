import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronDown,
  Play,
  Link2,
  ExternalLink,
  ListPlus,
  Bookmark,
  BookmarkCheck,
  MoreHorizontal,
  Plus,
  X,
  GripVertical
} from 'lucide-react'
import { api } from '../lib/store'
import { parseYouTubeLink } from '../../../shared/youtube.mjs'

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

function Row({ thumb, title, sub, active, onPlay, onQueue, square, song, ownId, index }) {
  // a picture YouTube won't serve: the plain square instead of a broken image
  const [failed, setFailed] = useState(null)
  return (
    <div className={`row yt-row ${active ? 'active' : ''}`} onDoubleClick={onPlay}>
      {thumb && failed !== thumb ? (
        <img src={thumb} alt="" className={square ? '' : 'wide'} onError={() => setFailed(thumb)} />
      ) : (
        <div className="thumb-ph" />
      )}
      <div className="row-text" onClick={onPlay} role="button" tabIndex={0}>
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      {onQueue && (
        <button
          className="rd sm ghost"
          aria-label="Add to queue"
          title="Add to queue"
          onClick={onQueue}
        >
          <ListPlus size={13} />
        </button>
      )}
      {song && <SongMenu song={song} ownId={ownId} index={index} />}
    </div>
  )
}

/**
 * The ⋯ beside a song: play it next, add it to the queue or to one of your playlists (or a
 * new one), or take it out of the playlist it's in.
 */
function SongMenu({ song, ownId, index }) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const done = (p) => {
    p.then?.(() => {})
    setOpen(false)
    setNaming(false)
    setName('')
  }
  return (
    <div className="song-menu" ref={box}>
      <button
        className="rd sm ghost"
        aria-label="More"
        title="Play next, add to a playlist…"
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button onClick={() => done(api.control('queueNext', song))}>Play next</button>
          <button onClick={() => done(api.control('queue', song))}>Add to queue</button>
          <OwnLists
            onPick={(id) => done(api.control('ytPlaylist', { op: 'add', id, song }))}
            skip={ownId}
          />
          {naming ? (
            <input
              className="field"
              autoFocus
              placeholder="Playlist name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim())
                  done(api.control('ytPlaylist', { op: 'new', name: name.trim(), song }))
                if (e.key === 'Escape') setNaming(false)
              }}
            />
          ) : (
            <button onClick={() => setNaming(true)}>
              <Plus size={12} /> New playlist…
            </button>
          )}
          {ownId && Number.isInteger(index) && (
            <button
              className="danger"
              onClick={() => done(api.control('ytPlaylist', { op: 'remove', id: ownId, index }))}
            >
              Remove from this playlist
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** "Add to …" for each of your playlists (not the one the song is in). */
function OwnLists({ onPick, skip }) {
  const mine = useQuery('ytMine', null, [])
  const lists = (mine?.own || []).filter((p) => p.id !== skip)
  if (!lists.length) return null
  return (
    <>
      <div className="menu-sect">Add to playlist</div>
      {lists.slice(0, 12).map((p) => (
        <button key={p.id} onClick={() => onPick(p.id)}>
          {p.name}
        </button>
      ))}
    </>
  )
}

/** Songs: click one to play the list from it; + adds it to the queue, ⋯ for the rest. */
function TrackList({ items, state, empty = 'Nothing here', ownId }) {
  if (!items?.length) return <div className="muted pad">{empty}</div>
  return items.map((v, i) => (
    <Row
      key={v.videoId + i}
      thumb={v.thumb}
      title={v.name}
      sub={v.artists || v.channel}
      active={state.track?.videoId === v.videoId}
      onPlay={() => api.control('playItems', { items, index: i })}
      onQueue={() => api.control('queue', v)}
      song={v}
      ownId={ownId}
      index={i}
    />
  ))
}

/** Albums and playlists: click one to see its songs. */
function ListRows({ lists, onOpen }) {
  return lists.map((p) => (
    <Row
      key={p.id}
      square={p.kind === 'album'}
      thumb={p.thumb}
      title={p.name}
      sub={[p.kind === 'album' ? 'Album' : 'Playlist', p.by, p.year].filter(Boolean).join(' · ')}
      onPlay={() => onOpen(p)}
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
  if (open) return <ListView list={open} state={state} onBack={() => setOpen(null)} />
  return (
    <>
      <PasteLink />
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
      {tab === 'playlists' && <Playlists state={state} settings={settings} onOpen={setOpen} />}
      {tab === 'recent' && <Recent state={state} />}
    </>
  )
}

/** The library kept in Glowtide, reloaded whenever it changes. */
const useMine = (state) => useQuery('ytMine', null, [state.ytLibRev])

function Liked({ state }) {
  const mine = useMine(state)
  if (mine === undefined) return <Loading />
  return (
    <>
      <TrackList
        items={mine.liked}
        state={state}
        empty="Press ♥ while a YouTube song plays, and it's kept here."
      />
      {state.google && <AccountLiked state={state} />}
    </>
  )
}

/** Liked on your YouTube account (Google sign-in): shown when asked for. */
function AccountLiked({ state }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <button className="sect link-sect" onClick={() => setShow(!show)}>
        <ChevronDown size={12} className={show ? '' : 'turned'} /> Liked on your YouTube account
      </button>
      {show && <AccountLikedList state={state} />}
    </>
  )
}

function AccountLikedList({ state }) {
  const d = useQuery('ytLiked')
  if (d === undefined) return <Loading />
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

function Playlists({ state, settings, onOpen }) {
  const mine = useMine(state)
  const [setup, setSetup] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  if (mine === undefined) return <Loading />
  const create = async () => {
    const r = await api.control('ytPlaylist', { op: 'new', name: name.trim() })
    setNaming(false)
    setName('')
    if (r?.id) onOpen({ id: r.id, playlistId: r.id, name: name.trim(), own: true })
  }
  return (
    <>
      <div className="sect sect-row">
        <span>Your playlists</span>
        {!naming && (
          <button className="pill" onClick={() => setNaming(true)}>
            <Plus size={12} /> New playlist
          </button>
        )}
      </div>
      {naming && (
        <div className="paste-row">
          <input
            className="field"
            autoFocus
            placeholder="Name it, then press Enter"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) create()
              if (e.key === 'Escape') setNaming(false)
            }}
          />
        </div>
      )}
      {mine.own.map((p) => (
        <Row
          key={p.id}
          square
          thumb={p.songs[0]?.thumb}
          title={p.name}
          sub={`${p.songs.length} ${p.songs.length === 1 ? 'song' : 'songs'}`}
          onPlay={() => onOpen({ id: p.id, playlistId: p.id, name: p.name, own: true })}
        />
      ))}
      {!mine.own.length && !naming && (
        <div className="muted pad">Make one with New playlist, or from the ⋯ beside any song.</div>
      )}
      <FromSpotify state={state} />
      <div className="sect">Saved from YouTube</div>
      {mine.lists.length ? (
        <ListRows lists={mine.lists} onOpen={onOpen} />
      ) : (
        <div className="muted pad">
          Albums and playlists you save show here. Find them in Search, or paste a playlist link
          above, then press Save.
        </div>
      )}
      {state.google ? (
        <AccountPlaylists onOpen={onOpen} />
      ) : (
        <>
          <button className="sect link-sect" onClick={() => setSetup(!setup)}>
            <ChevronDown size={12} className={setup ? '' : 'turned'} /> Your YouTube account’s
            playlists (optional)
          </button>
          {setup && <GoogleSetup settings={settings} />}
        </>
      )}
    </>
  )
}

/** Copy one of your Spotify playlists into one of yours here, its songs found on YouTube. */
function FromSpotify({ state }) {
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState(null)
  const run = state.ytImport
  if (run) {
    const pct = run.total ? Math.round((run.done / run.total) * 100) : 0
    return (
      <div className="copy-box">
        <div className="copy-line">
          {run.finished
            ? `${run.cancelled ? 'Stopped copying' : 'Copied'} “${run.name}”: ${run.found} of ${run.total} songs found on YouTube.`
            : `Copying “${run.name}”: ${run.done} of ${run.total} · ${run.found} found`}
        </div>
        {!run.finished && (
          <div className="copy-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
        {run.finished && run.missing.length > 0 && (
          <details className="fine">
            <summary>Not found ({run.missing.length})</summary>
            {run.missing.map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </details>
        )}
        <button
          className="pill"
          onClick={() => api.control(run.finished ? 'copySpotifyDone' : 'copySpotifyStop')}
        >
          {run.finished ? 'OK' : 'Stop'}
        </button>
      </div>
    )
  }
  return (
    <>
      <button className="sect link-sect" onClick={() => setOpen(!open)}>
        <ChevronDown size={12} className={open ? '' : 'turned'} /> Copy a Spotify playlist
      </button>
      {open && <SpotifyLists onErr={setErr} />}
      {err && <div className="error">{err}</div>}
    </>
  )
}

function SpotifyLists({ onErr }) {
  const d = useQuery('spotifyLists', null, [])
  if (d === undefined) return <Loading />
  if (d?.error) return <div className="muted pad">{d.error}</div>
  return (
    <>
      <p className="fine">
        Glowtide finds each song on YouTube and makes a playlist of yours here. Spotify only lets
        apps read playlists you made or collaborate on.
      </p>
      {d.map((p) => (
        <Row
          key={p.id}
          square
          thumb={p.thumb}
          title={p.name}
          sub={p.count != null ? `${p.count} songs` : 'Your liked songs on Spotify'}
          onPlay={async () => {
            onErr(null)
            const r = await api.control('copySpotify', { spotifyId: p.id, name: p.name })
            if (r?.error) onErr(r.error)
          }}
        />
      ))}
    </>
  )
}

function AccountPlaylists({ onOpen }) {
  const d = useQuery('ytPlaylists')
  return (
    <>
      <div className="sect">On your YouTube account</div>
      {d === undefined && <Loading />}
      {d?.error && <div className="error">{d.error}</div>}
      {Array.isArray(d) && !d.length && (
        <div className="muted pad">No playlists on this account</div>
      )}
      {Array.isArray(d) &&
        d.map((p) => (
          <Row
            key={p.id}
            thumb={p.thumb}
            title={p.name}
            sub={p.count != null ? `${p.count} items` : ''}
            onPlay={() => onOpen({ ...p, playlistId: p.id, kind: 'playlist', mine: true })}
          />
        ))}
    </>
  )
}

function Recent({ state }) {
  const mine = useMine(state)
  if (mine === undefined) return <Loading />
  return (
    <TrackList items={mine.recent} state={state} empty="Songs you play on YouTube show here." />
  )
}

/** An album's or playlist's songs, with Play and Save (to Library → Playlists). */
function ListView({ list, state, onBack }) {
  const id = list.playlistId || list.id
  // your own playlist changes as you edit it: asked again with the library
  const d = useQuery('ytListSongs', { playlistId: id, mine: !!list.mine }, [
    list.own ? state.ytLibRev : 0
  ])
  const mine = useMine(state)
  const saved = !!mine?.lists?.some((p) => p.id === id)
  const items = d?.items || []
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(list.name)
  const [sure, setSure] = useState(false)
  const shown = (list.own && d?.name) || list.name
  return (
    <>
      <div className="pl-head">
        <button className="rd sm" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={14} />
        </button>
        {renaming ? (
          <input
            className="field"
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                api.control('ytPlaylist', { op: 'rename', id, name: name.trim() })
                setRenaming(false)
              }
              if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <span
            className="t"
            title={list.own ? 'Click to rename' : undefined}
            onClick={() => list.own && (setName(shown), setRenaming(true))}
          >
            {shown}
          </span>
        )}
        {items.length > 0 && (
          <button className="pill" onClick={() => api.control('playItems', { items, index: 0 })}>
            <Play size={12} /> Play
          </button>
        )}
        {list.own && (
          <button
            className={`pill ${sure ? 'danger' : ''}`}
            title="Delete this playlist"
            onClick={() => {
              if (!sure) return setSure(true)
              api.control('ytPlaylist', { op: 'delete', id })
              onBack()
            }}
            onMouseLeave={() => setSure(false)}
          >
            {sure ? 'Delete?' : 'Delete'}
          </button>
        )}
        {!list.mine && !list.own && (
          <button
            className={`pill ${saved ? 'on' : ''}`}
            title={saved ? 'Saved in Library → Playlists · click to remove' : 'Save to Library'}
            onClick={() =>
              api.control('ytSave', {
                list: { ...list, count: d?.total ?? list.count },
                on: !saved
              })
            }
          >
            {saved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
            {saved ? 'Saved' : 'Save'}
          </button>
        )}
      </div>
      {d === undefined && <Loading />}
      {d?.error && <div className="error">{d.error}</div>}
      {d && !d.error && (
        <TrackList
          items={items}
          state={state}
          ownId={list.own ? id : undefined}
          empty={
            list.own
              ? 'No songs yet. Use the ⋯ beside any song, then Add to playlist.'
              : "YouTube didn't list its songs. It may be private."
          }
        />
      )}
    </>
  )
}

export function YtSearch({ state, settings }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState({ q: '', data: null })
  const [open, setOpen] = useState(null)
  // YouTube's own search has no daily limit: results come as you type. The official API
  // spends quota on every search, so it waits for Enter.
  const live = settings?.ytSearch !== 'official'
  const run = (term) => {
    if (term) api.query('ytFind', term).then((data) => setFound({ q: term, data }))
  }
  useEffect(() => {
    const term = q.trim()
    if (!live || !term) return
    const id = setTimeout(
      () => api.query('ytFind', term).then((data) => setFound({ q: term, data })),
      400
    )
    return () => clearTimeout(id)
  }, [q, live])
  if (open) return <ListView list={open} state={state} onBack={() => setOpen(null)} />
  const res = q.trim() && found.q ? found.data : null
  const none =
    res && !res.error && !res.songs?.length && !res.albums?.length && !res.playlists?.length
  return (
    <>
      <div className="paste-row">
        <input
          className="field"
          autoFocus
          placeholder="Songs, albums or playlists on YouTube"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(q.trim())}
        />
        {!live && (
          <button className="pill" onClick={() => run(q.trim())}>
            Search
          </button>
        )}
      </div>
      {!live && (
        <p className="fine">
          Press Enter to search. Each search uses 1% of your project’s free daily YouTube quota
          (Settings → App → Search YouTube with).
        </p>
      )}
      {res?.error && <div className="error">{res.error}</div>}
      {res?.songs?.length > 0 && (
        <>
          <div className="sect">Songs</div>
          <TrackList items={res.songs.slice(0, 10)} state={state} />
        </>
      )}
      {res?.albums?.length > 0 && (
        <>
          <div className="sect">Albums</div>
          <ListRows lists={res.albums.slice(0, 6)} onOpen={setOpen} />
        </>
      )}
      {res?.playlists?.length > 0 && (
        <>
          <div className="sect">Playlists</div>
          <ListRows lists={res.playlists.slice(0, 6)} onOpen={setOpen} />
        </>
      )}
      {none && <div className="muted pad">No matches</div>}
      {!q.trim() && <PasteLink />}
    </>
  )
}

/**
 * What's coming up, to change: click a song to play it now, drag it (by its handle) to
 * another place, × to take it out. + and ⋯ (Play next) beside any song add to it.
 */
export function YtQueue({ state }) {
  const q = state.ytQueue
  const [from, setFrom] = useState(null) // the place being dragged
  const [over, setOver] = useState(null)
  if (!q?.items?.length || q.index < 0)
    return (
      <div className="muted pad">
        Nothing lined up. Press + beside any song in Search or Library to add it, or ⋯ → Play next.
      </div>
    )
  const first = q.index + 1 // play-order place of the first song to come
  const upcoming = q.items.slice(first, first + 100)
  return (
    <>
      <div className="sect">
        Track {q.index + 1} of {q.items.length}
        {upcoming.length > 1 && ' · drag ⋮⋮ to reorder'}
      </div>
      {!upcoming.length && (
        <div className="muted pad">Nothing after this song. Press + beside any song to add it.</div>
      )}
      {upcoming.map((v, i) => {
        const at = first + i
        return (
          <div
            key={v.videoId + at}
            className={`row yt-row q-row ${over === at && from !== at ? 'drop' : ''}`}
            onDragOver={(e) => {
              if (from === null) return
              e.preventDefault()
              setOver(at)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (from !== null && from !== at) api.control('queueMove', { from, to: at })
              setFrom(null)
              setOver(null)
            }}
          >
            <span
              className="q-grip"
              draggable
              title="Drag to move"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                setFrom(at)
              }}
              onDragEnd={() => {
                setFrom(null)
                setOver(null)
              }}
            >
              <GripVertical size={13} />
            </span>
            <img src={`https://i.ytimg.com/vi/${v.videoId}/default.jpg`} alt="" className="wide" />
            <div
              className="row-text"
              role="button"
              tabIndex={0}
              title="Play it now"
              onClick={() => api.control('queueJump', at)}
            >
              {/* Titles of a pasted playlist aren't known until each video loads. */}
              <div className="t">{v.name || `Video ${at + 1}`}</div>
              <div className="s">{v.artists || 'Title shows when it plays'}</div>
            </div>
            <button
              className="rd sm ghost"
              aria-label="Remove from the queue"
              title="Remove from the queue"
              onClick={() => api.control('queueRemove', at)}
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </>
  )
}

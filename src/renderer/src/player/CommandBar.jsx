import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft, ListPlus, Play, Speaker, Sparkles } from 'lucide-react'
import { api, useGlowtide } from '../lib/store'
import { parseCommand } from '../../../shared/commands.mjs'

const REPEAT_NEXT = { off: 'context', context: 'track', track: 'off' }

/**
 * The command bar (Ctrl+Alt+G): type a command ("next", "volume 40", "seek 1:30") or a
 * song. Spotify searches as you type; YouTube Music on Enter (each search spends daily
 * quota). ↑ ↓ choose, Enter runs, Esc closes.
 */
export default function CommandBar() {
  const { state, settings } = useGlowtide()
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  const [found, setFound] = useState(null) // { q, rows }
  const [devices, setDevices] = useState(null)
  const [note, setNote] = useState('')
  const input = useRef(null)
  const list = useRef(null)

  // each opening starts clean
  useEffect(
    () =>
      api.onCommandOpen(() => {
        setText('')
        setFound(null)
        setDevices(null)
        setNote('')
        setSel(0)
        setTimeout(() => input.current?.focus(), 30)
      }),
    []
  )

  const parsed = useMemo(() => parseCommand(text), [text])
  const source = state?.source
  const query = parsed.query

  // Spotify: search as you type (10 results a type, the most Spotify now allows)
  useEffect(() => {
    if (!query || source !== 'spotify') return
    let live = true
    const id = setTimeout(async () => {
      const r = await api.query('search', query)
      if (live) setFound({ q: query, rows: spotifyRows(r) })
    }, 280)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [query, source])

  const close = () => api.closeCommand()
  const done = (r) => {
    if (r?.error) setNote(r.error)
    else close()
  }

  const run = async (row) => {
    if (!row) return
    setNote('')
    if (row.kind === 'device') return done(await api.control('transfer', row.id))
    if (row.kind === 'song') {
      if (parsed.queue) {
        const r = await api.control('queue', row.uri)
        if (!r?.error) setNote(`Queued: ${row.title}`)
        else setNote(r.error)
        return
      }
      return done(await api.control('playItems', row.play))
    }
    if (row.kind === 'ytsearch') {
      setNote('Searching YouTube…')
      const r = await api.query('ytSearch', query)
      if (r?.error) return setNote(r.error)
      setNote('')
      return setFound({ q: query, rows: ytRows(r) })
    }
    // a command
    const id = row.cmd.id
    const pb = state?.playback
    if (id === 'share') {
      const t = await api.share()
      return setNote(t ? 'Copied the song and its link' : 'Nothing is playing')
    }
    if (id === 'device') {
      const d = await api.query('devices')
      if (d?.error) return setNote(d.error)
      setDevices((d?.devices || []).map((x) => ({ kind: 'device', id: x.id, title: x.name })))
      return setSel(0)
    }
    if (id === 'lyrics')
      return done(api.setSettings({ lyrics: { overlay: !settings.lyrics.overlay } }))
    if (id === 'glow') return done(api.setSettings({ glow: { enabled: !settings.glow.enabled } }))
    if (id === 'mini') return done(api.setSettings({ mini: { enabled: !settings.mini?.enabled } }))
    if (id === 'fullscreen') return done(api.stage('open'))
    if (id === 'player') return done(api.showPlayer())
    if (id === 'shuffle') return done(await api.control('shuffle', !pb?.shuffle))
    if (id === 'repeat') return done(await api.control('repeat', REPEAT_NEXT[pb?.repeat || 'off']))
    if (id === 'like') return done(await api.control('like', !state?.liked))
    if (id === 'volume' || id === 'seek') {
      if (row.arg == null) return setNote(id === 'volume' ? 'Volume 0 to 100' : 'A time like 1:30')
      return done(await api.control(id, row.arg))
    }
    return done(await api.control(id))
  }

  // what Enter would do, in order
  const rows = useMemo(() => {
    if (devices) return devices
    const out = []
    if (parsed.command)
      out.push({ kind: 'cmd', cmd: parsed.command, arg: parsed.arg, invalid: parsed.invalid })
    for (const c of parsed.suggestions || [])
      if (c !== parsed.command) out.push({ kind: 'cmd', cmd: c })
    if (query && source === 'youtube' && found?.q !== query)
      out.push({ kind: 'ytsearch', title: `Search YouTube for “${query}”` })
    if (found?.q === query) out.push(...found.rows)
    return out
  }, [devices, parsed, query, source, found])

  // keep the chosen row in range and in view
  const chosen = Math.min(sel, Math.max(0, rows.length - 1))
  useEffect(() => {
    list.current?.querySelector('.cmd-row.on')?.scrollIntoView({ block: 'nearest' })
  }, [chosen])

  const key = (e) => {
    if (e.key === 'Escape') return close()
    if (e.key === 'ArrowDown') setSel((chosen + 1) % Math.max(1, rows.length))
    else if (e.key === 'ArrowUp') setSel((chosen - 1 + rows.length) % Math.max(1, rows.length))
    else if (e.key === 'Enter') run(rows[chosen])
    else return
    e.preventDefault()
  }

  const searchable = source === 'spotify' || source === 'youtube'
  return (
    <div className="cmd">
      <div className="cmd-field">
        <Search size={17} />
        <input
          ref={input}
          autoFocus
          value={text}
          spellCheck={false}
          placeholder={
            searchable
              ? 'A song, or a command: next, volume 40, seek 1:30, queue…'
              : 'A command: next, pause, share, lyrics, glow…'
          }
          onChange={(e) => {
            setText(e.target.value)
            setSel(0)
            setDevices(null)
            setNote('')
          }}
          onKeyDown={key}
        />
      </div>
      {note && <div className="cmd-note">{note}</div>}
      <div className="cmd-list" ref={list}>
        {rows.map((r, i) => (
          <button
            key={`${r.kind}${r.cmd?.id || r.uri || r.id || r.title}${i}`}
            className={`cmd-row ${i === chosen ? 'on' : ''}`}
            onMouseEnter={() => setSel(i)}
            onClick={() => run(r)}
          >
            <span className="cmd-ic">
              {r.kind === 'song' && r.thumb ? (
                <img src={r.thumb} alt="" />
              ) : r.kind === 'song' ? (
                <Play size={14} />
              ) : r.kind === 'device' ? (
                <Speaker size={14} />
              ) : r.kind === 'ytsearch' ? (
                <Search size={14} />
              ) : (
                <Sparkles size={14} />
              )}
            </span>
            <span className="cmd-t">
              <span className="cmd-title">
                {r.kind === 'cmd' ? r.cmd.label : r.title}
                {r.kind === 'cmd' && r.cmd.arg && (
                  <span className="cmd-arg">
                    {r.invalid ? `needs ${r.cmd.arg}` : r.arg != null ? '' : r.cmd.arg}
                  </span>
                )}
              </span>
              {r.sub && <span className="cmd-sub">{r.sub}</span>}
            </span>
            {i === chosen && (
              <span className="cmd-enter">
                {r.kind === 'song' && parsed.queue ? <ListPlus size={13} /> : null}
                <CornerDownLeft size={13} />
              </span>
            )}
          </button>
        ))}
        {query && source === 'spotify' && found?.q === query && !found.rows.length && (
          <div className="cmd-empty">Nothing found on Spotify</div>
        )}
        {query && !searchable && !parsed.command && !parsed.suggestions.length && (
          <div className="cmd-empty">
            Searching for songs needs Spotify or YouTube Music. Commands work with any app.
          </div>
        )}
      </div>
      <div className="cmd-foot">
        ↑ ↓ choose · Enter run · Esc close · “queue …” adds to the queue
      </div>
    </div>
  )
}

const art = (o) => {
  const im = o?.album?.images || o?.images || []
  return im[im.length - 1]?.url || im[0]?.url || null
}

function spotifyRows(r) {
  if (!r || r.error) return []
  const rows = []
  for (const t of r.tracks?.items || [])
    if (t?.uri)
      rows.push({
        kind: 'song',
        uri: t.uri,
        title: t.name,
        sub: (t.artists || []).map((a) => a.name).join(', '),
        thumb: art(t),
        play: { uris: [t.uri] }
      })
  for (const a of (r.albums?.items || []).slice(0, 3))
    if (a?.uri)
      rows.push({
        kind: 'song',
        uri: a.uri,
        title: a.name,
        sub: `Album · ${(a.artists || []).map((x) => x.name).join(', ')}`,
        thumb: art(a),
        play: { context_uri: a.uri }
      })
  for (const p of (r.playlists?.items || []).filter(Boolean).slice(0, 3))
    rows.push({
      kind: 'song',
      uri: p.uri,
      title: p.name,
      sub: `Playlist · ${p.owner?.display_name || ''}`,
      thumb: art(p),
      play: { context_uri: p.uri }
    })
  return rows
}

function ytRows(r) {
  return (Array.isArray(r) ? r : []).map((v, i, all) => ({
    kind: 'song',
    uri: v.videoId,
    title: v.name,
    sub: v.artists || v.channel || '',
    thumb: v.thumb,
    play: { items: all, index: i }
  }))
}

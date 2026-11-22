import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  CornerDownLeft,
  ListPlus,
  Loader2,
  Mic,
  Play,
  Speaker,
  Sparkles,
  Square
} from 'lucide-react'
import { api, useGlowtide } from '../lib/store'
import { parseCommand } from '../../../shared/commands.mjs'
import { MODEL_BYTES, cleanTranscript, isWakeText, voiceToCommand } from '../../../shared/voice.mjs'
import { listen, transcribe, warmUp } from '../lib/voice'
import { wakeFeed } from '../lib/mic'

const REPEAT_NEXT = { off: 'context', context: 'track', track: 'off' }
const MB = Math.round(MODEL_BYTES / 1e6)

function micError(e) {
  if (e?.name === 'NotAllowedError')
    return "Windows isn't letting Glowtide use the microphone: Settings → Privacy & security → Microphone."
  if (e?.name === 'NotFoundError') return 'No microphone found.'
  return `The microphone didn't start (${e?.message || e}).`
}

/**
 * The command bar (Ctrl+Alt+G): type a command ("next", "volume 40", "seek 1:30") or a
 * song. Spotify searches as you type; YouTube Music on Enter (each search spends daily
 * quota). ↑ ↓ choose, Enter runs, Esc closes.
 *
 * Or say it: the mic button, Ctrl+Alt+V or "Hey Glowtide" listens until you stop talking;
 * then a command runs at once, and "play …" / "queue …" plays or queues the first song found.
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
  // voice: 'idle' | 'listening' (waiting for you to talk) | 'hearing' | 'thinking' | 'model'
  const [mic, setMic] = useState('idle')
  const [level, setLevel] = useState(0)
  const [heard, setHeard] = useState('') // what's understood so far, while you talk
  const listening = useRef(null) // the AbortController while listening
  const auto = useRef(null) // { text, at }: run this line once its results are in
  const model = state?.voice

  const stopListening = () => {
    listening.current?.abort()
    listening.current = null
  }

  async function startListening(modelReady = model?.ready, again = false) {
    if (listening.current) return
    if (!modelReady) return setMic('model')
    const ac = new AbortController()
    listening.current = ac
    auto.current = null
    setNote('')
    setHeard('')
    setDevices(null)
    setMic('listening')
    warmUp()
    api.voiceHold(true) // the music down while you speak
    let samples = null
    let problem = ''
    try {
      samples = await listen({
        signal: ac.signal,
        mic: settings?.voice?.mic || '',
        onLevel: setLevel,
        onSpeech: () => setMic('hearing'),
        onPartial: (t) => {
          const c = cleanTranscript(t)
          if (c && !ac.signal.aborted) setHeard(c)
        }
      })
    } catch (e) {
      problem = micError(e)
    }
    let said = ''
    if (samples && !ac.signal.aborted) {
      setMic('thinking')
      try {
        said = await transcribe(samples)
      } catch (e) {
        problem = `Couldn't understand it (${e.message}).`
      }
    }
    await api.voiceHold(false)
    if (listening.current === ac) listening.current = null
    setMic('idle')
    setLevel(0)
    setHeard('')
    if (ac.signal.aborted) return
    if (problem) return setNote(problem)
    const v = voiceToCommand(said)
    // only "Hey Glowtide" was caught (you waited for the chime): listen for the command
    if (!v.text && !again && isWakeText(said)) return startListening(true, true)
    if (!v.text)
      return setNote(
        samples ? "Didn't catch that. Try again, or type it." : "Didn't hear anything."
      )
    setText(v.text)
    setSel(0)
    setFound(null)
    if (v.autorun) auto.current = { text: v.text, at: Date.now() }
  }
  const listenRef = useRef(startListening)
  useEffect(() => {
    listenRef.current = startListening
  })

  // each opening starts clean (and listening, when it was opened to listen)
  useEffect(
    () =>
      api.onCommandOpen((o) => {
        stopListening()
        auto.current = null
        setText('')
        setFound(null)
        setDevices(null)
        setNote('')
        setSel(0)
        setMic('idle')
        setTimeout(() => {
          input.current?.focus()
          if (o?.listen) listenRef.current()
        }, 30)
      }),
    []
  )
  useEffect(() => api.onCommandListen(() => listenRef.current()), [])
  // An unsure "Hey Glowtide": what Whisper makes of the last few seconds of sound
  useEffect(
    () =>
      api.onVoiceCheck(async ({ id, pcm }) => {
        let text = null
        try {
          // a copy of its own, so the samples line up on two bytes
          const bytes = new Uint8Array(pcm).slice(0, pcm.byteLength & ~1)
          const i16 = new Int16Array(bytes.buffer)
          const f = new Float32Array(i16.length)
          for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768
          text = await transcribe(f)
        } catch {
          /* not understood: not the wake word */
        }
        api.voiceChecked(id, text)
      }),
    []
  )
  // While "Hey Glowtide" is on, this window (hidden or not) is its ears: the chosen
  // microphone, streamed to Windows' recogniser in the main process.
  useEffect(() => {
    let stop = null
    const apply = (o) => {
      stop?.()
      stop = null
      if (o?.on)
        stop = wakeFeed({
          mic: o.mic || '',
          send: (buf) => api.voicePcm(buf),
          onError: (e) =>
            api.voiceFeedError(e?.name === 'NotFoundError' ? 'no-microphone' : micError(e))
        })
    }
    api.voiceFeedWanted().then(apply)
    const off = api.onVoiceFeed(apply)
    return () => {
      off()
      stop?.()
    }
  }, [])
  // hidden (Esc, or clicking elsewhere): the microphone is let go at once
  useEffect(() => {
    const vis = () => document.hidden && stopListening()
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])
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

  // something said that runs by itself: a command at once, a song once it's been found
  useEffect(() => {
    const a = auto.current
    if (!a || a.text !== text) return
    if (Date.now() - a.at > 10000) return void (auto.current = null)
    const first = rows[0]
    let row = null
    if (parsed.command && !parsed.query) {
      if (first?.kind === 'cmd' && !first.invalid) row = first
      else auto.current = null
    } else if (!parsed.query || !first) return
    else if (first.kind === 'ytsearch') {
      // YouTube is searched once (each search spends quota); its results come back as songs
      if (a.searching) return
      row = first
    } else if (found?.q === parsed.query) {
      row = rows.find((r) => r.kind === 'song') || null
      if (!row) auto.current = null // nothing found: the list says so
    }
    if (!row) return
    // run after this render, as a click would
    const t = setTimeout(() => {
      if (auto.current !== a) return
      if (row.kind === 'ytsearch') a.searching = true
      else auto.current = null
      run(row)
    })
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, text, found])

  // keep the chosen row in range and in view
  const chosen = Math.min(sel, Math.max(0, rows.length - 1))
  useEffect(() => {
    list.current?.querySelector('.cmd-row.on')?.scrollIntoView({ block: 'nearest' })
  }, [chosen])

  const key = (e) => {
    if (e.key === 'Escape') {
      stopListening()
      return close()
    }
    if (e.key === 'ArrowDown') setSel((chosen + 1) % Math.max(1, rows.length))
    else if (e.key === 'ArrowUp') setSel((chosen - 1 + rows.length) % Math.max(1, rows.length))
    else if (e.key === 'Enter') run(rows[chosen])
    else return
    e.preventDefault()
  }

  const searchable = source === 'spotify' || source === 'youtube'
  const live = mic === 'listening' || mic === 'hearing'
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
            live
              ? 'Listening…'
              : searchable
                ? 'A song, or a command: next, volume 40, seek 1:30, queue…'
                : 'A command: next, pause, share, lyrics, glow…'
          }
          onChange={(e) => {
            auto.current = null
            setText(e.target.value)
            setSel(0)
            setDevices(null)
            setNote('')
          }}
          onKeyDown={key}
        />
        <button
          className={`cmd-mic ${mic}`}
          style={{ '--lv': level }}
          title={live || mic === 'thinking' ? 'Stop listening' : 'Say it (Ctrl+Alt+V)'}
          aria-label={live || mic === 'thinking' ? 'Stop listening' : 'Say a command'}
          onClick={() => (listening.current ? stopListening() : startListening())}
        >
          {mic === 'thinking' ? (
            <Loader2 size={16} className="spin" />
          ) : live ? (
            <Square size={12} />
          ) : (
            <Mic size={16} />
          )}
        </button>
      </div>
      {(live || mic === 'thinking') && (
        <div className="cmd-heard">
          {heard
            ? `“${heard}”`
            : mic === 'thinking'
              ? 'Understanding…'
              : 'Listening… say a song or a command'}
        </div>
      )}
      {mic === 'model' && (
        <div className="cmd-model">
          <p>
            Speaking a command needs Glowtide&apos;s speech model ({MB} MB), downloaded once. It
            runs on this PC: nothing you say leaves it.
          </p>
          {model?.downloading ? (
            <div className="cmd-progress">
              <span style={{ width: `${model.percent}%` }} />
              <em>Downloading… {model.percent}%</em>
            </div>
          ) : (
            <button
              className="primary small"
              onClick={async () => {
                const s = await api.voiceDownload()
                // downloaded: listen, as was asked
                if (s?.ready) {
                  setMic('idle')
                  startListening(true)
                }
              }}
            >
              Download the speech model
            </button>
          )}
          {model?.error && !model.downloading && (
            <p className="cmd-err">The download didn&apos;t finish: {model.error}</p>
          )}
        </div>
      )}
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
        ↑ ↓ choose · Enter run · Esc close · “queue …” adds to the queue · Ctrl+Alt+V speak
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

// The phone remote's page: plain HTML, CSS and JS served by remote.js (no framework, nothing
// loaded from elsewhere). It pairs once with a code, then shows the song, its cover, the
// lyric line being sung and the controls, asking the PC every second while it's open.

export const REMOTE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d0b10">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Glowtide remote</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<main id="pair" hidden>
  <h1>Glowtide</h1>
  <p>On your PC, open Glowtide → Settings → App → Phone remote, press <b>Get a code</b>, and type the code here.</p>
  <form id="pairForm">
    <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" aria-label="Pairing code">
    <button type="submit">Pair</button>
  </form>
  <p id="pairErr" class="err" role="alert"></p>
</main>
<main id="remote" hidden>
  <div class="art"><img id="cover" alt=""><div id="noCover" class="ph"></div></div>
  <div class="meta">
    <div id="title" class="title">Nothing playing</div>
    <div id="artist" class="artist"></div>
  </div>
  <div id="lyric" class="lyric" aria-live="polite"></div>
  <div id="nextLyric" class="next"></div>
  <div class="bar">
    <input id="seek" type="range" min="0" max="1000" value="0" aria-label="Position">
    <div class="times"><span id="pos">0:00</span><span id="dur">0:00</span></div>
  </div>
  <div class="controls">
    <button id="like" class="small" aria-label="Like" hidden>♡</button>
    <button id="prev" aria-label="Previous">⏮</button>
    <button id="play" class="big" aria-label="Play">▶</button>
    <button id="next" aria-label="Next">⏭</button>
    <span class="small"></span>
  </div>
  <label id="volRow" class="vol" hidden><span>Volume</span><input id="vol" type="range" min="0" max="100" aria-label="Volume"></label>
  <p id="err" class="err" role="alert"></p>
  <p id="app" class="app"></p>
</main>
<script src="/app.js"></script>
</body>
</html>`

export const REMOTE_CSS = `
:root { --accent: #e0a040; color-scheme: dark; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; background: #0d0b10; color: #f3ece6; font: 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
body { min-height: 100svh; padding: max(16px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom)); }
main { max-width: 460px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
h1 { margin: 24px 0 0; font-size: 28px; }
p { color: #b9b2bb; margin: 0; }
form { display: flex; gap: 8px; }
input#code { flex: 1; min-width: 0; font-size: 22px; letter-spacing: 6px; text-align: center; padding: 12px; border-radius: 12px; border: 1px solid #2a2530; background: #17141b; color: inherit; }
button { font: inherit; color: inherit; background: #1c191f; border: 0; border-radius: 999px; min-width: 52px; min-height: 52px; font-size: 22px; cursor: pointer; }
button:active { transform: scale(0.96); }
form button { font-size: 17px; padding: 0 20px; background: var(--accent); color: #17110d; font-weight: 600; }
.art { width: 100%; aspect-ratio: 1; border-radius: 18px; overflow: hidden; background: #17141b; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
.art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph { width: 100%; height: 100%; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 40%, #17141b), #17141b); }
.title { font-size: 21px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artist { color: #b9b2bb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lyric { min-height: 2.6em; font-size: 22px; font-weight: 700; line-height: 1.25; text-wrap: balance; }
.next { min-height: 1.4em; color: #8f8790; font-size: 15px; margin-top: -6px; }
input[type=range] { width: 100%; accent-color: var(--accent); }
.times { display: flex; justify-content: space-between; font-size: 12px; color: #8f8790; font-variant-numeric: tabular-nums; }
.controls { display: flex; align-items: center; justify-content: space-between; }
.controls .big { min-width: 76px; min-height: 76px; font-size: 30px; background: var(--accent); color: #17110d; }
.controls .small { min-width: 44px; min-height: 44px; font-size: 20px; background: none; }
.controls .liked { color: var(--accent); }
.vol { display: flex; align-items: center; gap: 12px; color: #b9b2bb; font-size: 14px; }
.err { color: #ff8a7a; min-height: 1.2em; font-size: 14px; }
.app { font-size: 12px; color: #5d5860; text-align: center; }
button:disabled { opacity: 0.35; }
`

export const REMOTE_JS = `
'use strict'
const $ = (id) => document.getElementById(id)
const KEY = 'glowtide-remote-token'
let token = null
try { token = localStorage.getItem(KEY) } catch (e) {}
let state = null
let gotAt = 0
let lines = []
let lyricsFor = null
let coverFor = null
let dragging = false
let timer = null

const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const show = (id) => { $('pair').hidden = id !== 'pair'; $('remote').hidden = id !== 'remote' }

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Glowtide-Token': token || '', ...(opts.headers || {}) } })
  if (r.status === 401) { forgetToken(); throw new Error('unpaired') }
  return r
}
function forgetToken() {
  token = null
  try { localStorage.removeItem(KEY) } catch (e) {}
  show('pair')
}

$('pairForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('pairErr').textContent = ''
  const code = $('code').value.replace(/\\D/g, '')
  try {
    const r = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: (navigator.userAgentData && navigator.userAgentData.platform) || 'Phone' }) })
    const j = await r.json()
    if (!r.ok || !j.token) { $('pairErr').textContent = j.error || 'Couldn’t pair.'; return }
    token = j.token
    try { localStorage.setItem(KEY, token) } catch (e) {}
    $('code').value = ''
    start()
  } catch (err) { $('pairErr').textContent = 'Can’t reach Glowtide. Is the PC on the same Wi-Fi?' }
})

function position() {
  if (!state) return 0
  const p = state.positionMs + (state.playing ? Date.now() - gotAt : 0)
  return state.track && state.track.durationMs ? Math.min(p, state.track.durationMs) : p
}

async function poll() {
  try {
    const r = await api('/api/state')
    state = await r.json()
    gotAt = Date.now()
    $('err').textContent = ''
    render()
    const id = state.track && state.track.id
    if (id !== lyricsFor) loadLyrics(id)
    if (id !== coverFor) loadCover(id)
  } catch (e) {
    if (e.message !== 'unpaired') $('err').textContent = 'Lost touch with Glowtide…'
  }
}

async function loadLyrics(id) {
  lyricsFor = id
  lines = []
  if (!id) return
  try { const j = await (await api('/api/lyrics')).json(); if (j.id === lyricsFor) lines = j.lines || [] } catch (e) {}
}

let coverUrl = null
async function loadCover(id) {
  coverFor = id
  const img = $('cover')
  try {
    const r = id ? await api('/api/cover') : null
    if (coverFor !== id) return
    if (coverUrl) URL.revokeObjectURL(coverUrl)
    coverUrl = r && r.status === 200 ? URL.createObjectURL(await r.blob()) : null
  } catch (e) { coverUrl = null }
  img.hidden = !coverUrl
  $('noCover').hidden = !!coverUrl
  if (coverUrl) img.src = coverUrl
}

function render() {
  const s = state
  if (s.accent && /^#[0-9a-f]{6}$/i.test(s.accent)) document.documentElement.style.setProperty('--accent', s.accent)
  $('title').textContent = s.track ? s.track.title : 'Nothing playing'
  $('artist').textContent = s.track ? s.track.artist : ''
  $('play').textContent = s.playing ? '⏸' : '▶'
  $('play').setAttribute('aria-label', s.playing ? 'Pause' : 'Play')
  $('prev').disabled = !s.can.previous
  $('next').disabled = !s.can.next
  $('seek').disabled = !s.can.seek
  $('like').hidden = !s.can.like
  $('like').textContent = s.liked ? '♥' : '♡'
  $('like').classList.toggle('liked', !!s.liked)
  $('volRow').hidden = !s.can.volume
  if (s.can.volume && document.activeElement !== $('vol')) $('vol').value = s.volume == null ? 100 : s.volume
  $('app').textContent = s.app ? 'Following ' + s.app : ''
  $('dur').textContent = fmt(s.track ? s.track.durationMs : 0)
}

function tick() {
  if (state) {
    const pos = position()
    const dur = state.track ? state.track.durationMs : 0
    if (!dragging) {
      $('seek').value = dur ? Math.round((pos / dur) * 1000) : 0
      $('pos').textContent = fmt(pos)
    }
    let i = -1
    const at = pos + (state.offsetMs || 0)
    for (let k = 0; k < lines.length; k++) if (lines[k].t <= at) i = k
    const cur = i >= 0 ? lines[i].text : ''
    const nxt = lines[i + 1] ? lines[i + 1].text : ''
    if ($('lyric').textContent !== cur) $('lyric').textContent = cur
    if ($('nextLyric').textContent !== nxt) $('nextLyric').textContent = nxt
  }
  requestAnimationFrame(tick)
}

async function send(action, arg) {
  try {
    const r = await api('/api/control', { method: 'POST', body: JSON.stringify({ action, arg }) })
    if (!r.ok) { const j = await r.json().catch(() => ({})); $('err').textContent = j.error || 'That didn’t work.' }
    setTimeout(poll, 300)
  } catch (e) {}
}

$('play').onclick = () => { if (!state) return; send(state.playing ? 'pause' : 'play'); state.playing = !state.playing; state.positionMs = position(); gotAt = Date.now(); render() }
$('prev').onclick = () => send('previous')
$('next').onclick = () => send('next')
$('like').onclick = () => state && send('like', !state.liked)
$('seek').addEventListener('input', () => { dragging = true; const dur = state && state.track ? state.track.durationMs : 0; $('pos').textContent = fmt(($('seek').value / 1000) * dur) })
$('seek').addEventListener('change', () => { dragging = false; const dur = state && state.track ? state.track.durationMs : 0; if (dur) send('seek', Math.round(($('seek').value / 1000) * dur)) })
$('vol').addEventListener('change', () => send('volume', Number($('vol').value)))

function start() {
  show('remote')
  poll()
  clearInterval(timer)
  timer = setInterval(() => { if (!document.hidden) poll() }, 1000)
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && token) poll() })
requestAnimationFrame(tick)
if (token) start(); else show('pair')
`

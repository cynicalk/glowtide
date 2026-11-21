// The share card: drawn on a canvas at full size (1080 wide), so the saved image is sharp
// whatever the preview's size. The cover blurred as the background, the cover itself in a
// circle (as in the player), the line you picked, the song, and a small Glowtide mark.

export const CARD_SIZES = {
  story: { label: 'Story', w: 1080, h: 1920 },
  square: { label: 'Square', w: 1080, h: 1080 }
}

const FONT = '"Segoe UI Variable Display", "Segoe UI", sans-serif'

/** Splits text into lines that fit maxWidth at the canvas's current font. */
function wrap(g, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const out = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (g.measureText(next).width <= maxWidth || !line) line = next
    else {
      out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

export function drawCard(canvas, { size = 'story', cover, line, title, artist }) {
  const { w: W, h: H } = CARD_SIZES[size] || CARD_SIZES.story
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  const story = size === 'story'

  // background: the cover, blurred and darkened; a soft gradient without one
  g.fillStyle = '#0d0b10'
  g.fillRect(0, 0, W, H)
  if (cover) {
    const s = Math.max(W / cover.width, H / cover.height) * 1.25
    g.save()
    g.filter = 'blur(70px) saturate(1.3) brightness(0.55)'
    g.drawImage(
      cover,
      (W - cover.width * s) / 2,
      (H - cover.height * s) / 2,
      cover.width * s,
      cover.height * s
    )
    g.restore()
  } else {
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#3a2a5e')
    grad.addColorStop(1, '#0d0b10')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
  }
  const shade = g.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(0,0,0,0.15)')
  shade.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = shade
  g.fillRect(0, 0, W, H)

  // the cover, round
  const d = story ? 600 : 380
  const cx = W / 2
  const cy = story ? 520 : 290
  if (cover) {
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.55)'
    g.shadowBlur = 60
    g.shadowOffsetY = 24
    g.beginPath()
    g.arc(cx, cy, d / 2, 0, Math.PI * 2)
    g.fillStyle = '#000'
    g.fill()
    g.restore()
    g.save()
    g.beginPath()
    g.arc(cx, cy, d / 2, 0, Math.PI * 2)
    g.clip()
    const s = Math.max(d / cover.width, d / cover.height)
    g.drawImage(
      cover,
      cx - (cover.width * s) / 2,
      cy - (cover.height * s) / 2,
      cover.width * s,
      cover.height * s
    )
    g.restore()
  }

  // the line, as large as fits (up to six lines of text)
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#ffffff'
  let px = story ? 82 : 64
  let rows
  for (;;) {
    g.font = `700 ${px}px ${FONT}`
    rows = wrap(g, line, W - 160)
    if (rows.length <= (story ? 6 : 4) || px <= 40) break
    px -= 4
  }
  const lh = px * 1.18
  const top = (story ? 1010 : 600) + px
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.5)'
  g.shadowBlur = 24
  rows.forEach((r, i) => g.fillText(r, cx, top + i * lh))
  g.restore()

  // the song
  const after = top + rows.length * lh + (story ? 50 : 30)
  g.font = `600 ${story ? 40 : 34}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.fillText(title, cx, after)
  g.font = `400 ${story ? 34 : 28}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.fillText(artist, cx, after + (story ? 50 : 42))

  // a small mark
  g.font = `600 ${story ? 30 : 26}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillText('Glowtide', cx, H - (story ? 90 : 50))
}

/** Rounded rectangle path (the canvas's own roundRect, with a fallback). */
function rounded(g, x, y, w, h, r) {
  g.beginPath()
  if (g.roundRect) g.roundRect(x, y, w, h, r)
  else g.rect(x, y, w, h)
}

/** Cuts text to fit maxWidth, with an ellipsis. */
function fit(g, text, maxWidth) {
  let t = String(text || '')
  if (g.measureText(t).width <= maxWidth) return t
  while (t && g.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/**
 * The stats card (a story, 1080 x 1920): the period, time listened, plays, the top five songs
 * with their covers, and the top artist. covers: images for the top songs, in order (null
 * where a song has none).
 */
export function drawStatsCard(canvas, { data, covers = [] }) {
  const W = 1080
  const H = 1920
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  const titles = {
    week: 'My week in music',
    month: 'My month in music',
    year: 'My year in music',
    all: 'My music'
  }
  const hero = covers.find(Boolean)

  // background: the top song's cover, blurred; a soft gradient without one
  g.fillStyle = '#0d0b10'
  g.fillRect(0, 0, W, H)
  if (hero) {
    const s = Math.max(W / hero.width, H / hero.height) * 1.3
    g.save()
    g.filter = 'blur(80px) saturate(1.3) brightness(0.5)'
    g.drawImage(
      hero,
      (W - hero.width * s) / 2,
      (H - hero.height * s) / 2,
      hero.width * s,
      hero.height * s
    )
    g.restore()
  } else {
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#3a2a5e')
    grad.addColorStop(1, '#0d0b10')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
  }
  const shade = g.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(0,0,0,0.1)')
  shade.addColorStop(1, 'rgba(0,0,0,0.6)')
  g.fillStyle = shade
  g.fillRect(0, 0, W, H)

  const L = 96
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  // the period
  g.fillStyle = '#fff'
  g.font = `700 76px ${FONT}`
  g.fillText(titles[data.range] || titles.week, L, 230)
  const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  g.font = `400 36px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.fillText(`${day(data.from)} – ${day(data.to)}`, L, 290)

  // time listened, plays
  const min = Math.floor(data.ms / 60000)
  const big = min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1)} hours` : `${min} minutes`
  g.fillStyle = '#fff'
  g.font = `800 132px ${FONT}`
  g.fillText(big, L, 480)
  g.font = `500 40px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.8)'
  g.fillText(
    `listened · ${data.plays} ${data.plays === 1 ? 'play' : 'plays'} · ${data.songs} ${data.songs === 1 ? 'song' : 'songs'}`,
    L,
    550
  )

  // the top five
  g.font = `600 34px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.6)'
  g.fillText('TOP SONGS', L, 700)
  const size = 132
  data.topSongs.slice(0, 5).forEach((s, i) => {
    const y = 740 + i * 172
    g.font = `700 44px ${FONT}`
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.fillText(String(i + 1), L, y + size / 2 + 16)
    const x = L + 64
    const img = covers[i]
    g.save()
    rounded(g, x, y, size, size, 18)
    g.clip()
    if (img) {
      const k = Math.max(size / img.width, size / img.height)
      g.drawImage(
        img,
        x + (size - img.width * k) / 2,
        y + (size - img.height * k) / 2,
        img.width * k,
        img.height * k
      )
    } else {
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(x, y, size, size)
    }
    g.restore()
    const tx = x + size + 36
    const room = W - tx - L
    g.fillStyle = '#fff'
    g.font = `600 42px ${FONT}`
    g.fillText(fit(g, s.title, room), tx, y + 56)
    g.fillStyle = 'rgba(255,255,255,0.7)'
    g.font = `400 34px ${FONT}`
    g.fillText(
      fit(g, `${s.artist} · ${s.plays} ${s.plays === 1 ? 'play' : 'plays'}`, room),
      tx,
      y + 104
    )
  })

  // the top artist
  const top = data.topArtists[0]
  if (top) {
    g.font = `600 34px ${FONT}`
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.fillText('TOP ARTIST', L, 1660)
    g.font = `700 64px ${FONT}`
    g.fillStyle = '#fff'
    g.fillText(fit(g, top.artist, W - 2 * L), L, 1740)
  }

  // a small mark
  g.textAlign = 'center'
  g.font = `600 30px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillText('Glowtide', W / 2, H - 70)
}

// ---------- the animated share clip ----------
// The card, moving: the blurred cover drifting, the round cover turning slowly, and the line
// coming in word by word as if sung, then held. Drawn frame by frame onto the card's canvas
// while a MediaRecorder records it (see makeClip in Player.jsx).

export const CLIP_SECONDS = 8

/** Done once per clip: the blurred background, which is too costly to blur every frame. */
export function prepareClip({ size = 'story', cover }) {
  const { w: W, h: H } = CARD_SIZES[size] || CARD_SIZES.story
  const bg = document.createElement('canvas')
  // a little larger than the frame, so it can drift and zoom without showing an edge
  bg.width = Math.round(W * 1.2)
  bg.height = Math.round(H * 1.2)
  const g = bg.getContext('2d')
  g.fillStyle = '#0d0b10'
  g.fillRect(0, 0, bg.width, bg.height)
  if (cover) {
    const s = Math.max(bg.width / cover.width, bg.height / cover.height) * 1.25
    g.filter = 'blur(70px) saturate(1.3) brightness(0.55)'
    g.drawImage(
      cover,
      (bg.width - cover.width * s) / 2,
      (bg.height - cover.height * s) / 2,
      cover.width * s,
      cover.height * s
    )
    g.filter = 'none'
  } else {
    const grad = g.createLinearGradient(0, 0, bg.width, bg.height)
    grad.addColorStop(0, '#3a2a5e')
    grad.addColorStop(1, '#0d0b10')
    g.fillStyle = grad
    g.fillRect(0, 0, bg.width, bg.height)
  }
  return { bg, W, H, size }
}

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

/** One frame of the clip at time t (seconds). */
export function drawClipFrame(canvas, prep, { cover, line, title, artist, t }) {
  const { bg, W, H, size } = prep
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  const g = canvas.getContext('2d')
  const story = size === 'story'
  const p = t / CLIP_SECONDS

  // the background drifts and slowly comes closer
  const z = 1 + 0.06 * p
  const dx = (bg.width - W) / 2 + Math.sin(p * Math.PI) * 30
  const dy = (bg.height - H) / 2
  g.save()
  g.translate(W / 2, H / 2)
  g.scale(z, z)
  g.translate(-W / 2, -H / 2)
  g.drawImage(bg, -dx, -dy)
  g.restore()
  const shade = g.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(0,0,0,0.15)')
  shade.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = shade
  g.fillRect(0, 0, W, H)

  // the cover, round, turning slowly and coming in at the start
  const d = story ? 600 : 380
  const cx = W / 2
  const cy = story ? 520 : 290
  const inn = ease(t / 0.8)
  if (cover) {
    g.save()
    g.globalAlpha = inn
    g.translate(cx, cy)
    g.scale(0.9 + 0.1 * inn, 0.9 + 0.1 * inn)
    g.rotate(p * 0.5)
    g.shadowColor = 'rgba(0,0,0,0.55)'
    g.shadowBlur = 60
    g.beginPath()
    g.arc(0, 0, d / 2, 0, Math.PI * 2)
    g.fillStyle = '#000'
    g.fill()
    g.shadowBlur = 0
    g.clip()
    const s = Math.max(d / cover.width, d / cover.height)
    g.drawImage(
      cover,
      (-cover.width * s) / 2,
      (-cover.height * s) / 2,
      cover.width * s,
      cover.height * s
    )
    g.restore()
  }

  // the line: laid out as on the card, each word lit as it is "sung"
  let px = story ? 82 : 64
  let rows
  for (;;) {
    g.font = `700 ${px}px ${FONT}`
    rows = wrap(g, line, W - 160)
    if (rows.length <= (story ? 6 : 4) || px <= 40) break
    px -= 4
  }
  const lh = px * 1.18
  const top = (story ? 1010 : 600) + px
  const words = rows.flatMap((r) => r.split(' '))
  const n = Math.max(1, words.length)
  // sung from 1 s to 6 s, then held
  const at = (i) => 1 + (5 * i) / n
  let k = 0
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  rows.forEach((r, ri) => {
    const ws = r.split(' ')
    const space = g.measureText(' ').width
    const width = g.measureText(r).width
    let x = cx - width / 2
    const y = top + ri * lh
    for (const w of ws) {
      const since = t - at(k)
      const lit = ease(since / 0.35)
      const cur = since >= 0 && since < 5 / n
      g.save()
      g.globalAlpha = 0.28 + 0.72 * lit
      if (cur) {
        g.shadowColor = 'rgba(255,255,255,0.85)'
        g.shadowBlur = 28
      } else {
        g.shadowColor = 'rgba(0,0,0,0.5)'
        g.shadowBlur = 24
      }
      g.fillStyle = '#ffffff'
      // a word lifts a little as it lands
      g.fillText(w, x, y - 10 * (1 - lit) * (since >= 0 ? 1 : 0))
      g.restore()
      x += g.measureText(w).width + space
      k++
    }
  })

  // the song, and a small mark
  g.textAlign = 'center'
  const after = top + rows.length * lh + (story ? 50 : 30)
  g.globalAlpha = ease((t - 0.4) / 0.8)
  g.font = `600 ${story ? 40 : 34}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.fillText(title, cx, after)
  g.font = `400 ${story ? 34 : 28}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.fillText(artist, cx, after + (story ? 50 : 42))
  g.font = `600 ${story ? 30 : 26}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillText('Glowtide', cx, H - (story ? 90 : 50))
  g.globalAlpha = 1
}

/** The best format the recorder offers: MP4 (plays everywhere) or WebM. */
export function clipFormat() {
  for (const [type, ext] of [
    ['video/mp4;codecs=avc1.640028', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm', 'webm']
  ])
    if (window.MediaRecorder?.isTypeSupported(type)) return { type, ext }
  return null
}

/**
 * Records the clip on this canvas: CLIP_SECONDS of drawClipFrame, as MP4 (or WebM).
 * onSecond(left) counts down; open() false stops it (the card was closed).
 * Returns { bytes, ext }, { error }, or null when stopped.
 */
export async function recordClip(canvas, { size, cover, line, title, artist }, opts = {}) {
  const { onSecond = () => {}, open = () => true } = opts
  const fmt = clipFormat()
  if (!fmt) return { error: 'This PC can’t record video.' }
  const prep = prepareClip({ size, cover })
  const info = { cover, line, title, artist }
  drawClipFrame(canvas, prep, { ...info, t: 0 })
  const stream = canvas.captureStream(30)
  const chunks = []
  const mr = new MediaRecorder(stream, { mimeType: fmt.type, videoBitsPerSecond: 8e6 })
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const stopped = new Promise((r) => (mr.onstop = r))
  mr.start(500)
  onSecond(CLIP_SECONDS)
  const t0 = performance.now()
  let shown = CLIP_SECONDS
  await new Promise((resolve) => {
    const frame = () => {
      const t = Math.min(CLIP_SECONDS, (performance.now() - t0) / 1000)
      drawClipFrame(canvas, prep, { ...info, t })
      const left = Math.ceil(CLIP_SECONDS - t)
      if (left !== shown) onSecond((shown = left))
      if (t < CLIP_SECONDS && open()) requestAnimationFrame(frame)
      else resolve()
    }
    requestAnimationFrame(frame)
  })
  mr.stop()
  await stopped
  stream.getTracks().forEach((tr) => tr.stop())
  if (!open()) return null
  const bytes = new Uint8Array(await new Blob(chunks, { type: fmt.type }).arrayBuffer())
  return { bytes, ext: fmt.ext }
}

// ---------- your year in music: story slides ----------

export const YEAR_SLIDES = ['intro', 'songs', 'artists', 'moments', 'line']

const hours = (ms) => {
  const h = ms / 3600000
  return h >= 10
    ? `${Math.round(h)} hours`
    : h >= 1
      ? `${h.toFixed(1)} hours`
      : `${Math.round(ms / 60000)} minutes`
}
const dayName = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })

/** One slide of the year (1080 x 1920). covers: images for the top songs, in order. */
export function drawYearSlide(canvas, { slide, y, covers = [], fav = null, favCover = null }) {
  const W = 1080
  const H = 1920
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  const hero = slide === 'line' ? favCover : covers.find(Boolean)
  // background: a cover blurred, or a deep gradient that shifts with the slide
  const hues = {
    intro: '#3a2a5e',
    songs: '#1f3b5e',
    artists: '#5e2a45',
    moments: '#2a5e4a',
    line: '#5e4a2a'
  }
  g.fillStyle = '#0d0b10'
  g.fillRect(0, 0, W, H)
  if (hero) {
    const s = Math.max(W / hero.width, H / hero.height) * 1.3
    g.save()
    g.filter = 'blur(80px) saturate(1.3) brightness(0.45)'
    g.drawImage(
      hero,
      (W - hero.width * s) / 2,
      (H - hero.height * s) / 2,
      hero.width * s,
      hero.height * s
    )
    g.restore()
  } else {
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, hues[slide] || '#3a2a5e')
    grad.addColorStop(1, '#0d0b10')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
  }
  const shade = g.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(0,0,0,0.1)')
  shade.addColorStop(1, 'rgba(0,0,0,0.6)')
  g.fillStyle = shade
  g.fillRect(0, 0, W, H)

  const L = 96
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  const label = (text, yy) => {
    g.font = `600 34px ${FONT}`
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.fillText(text.toUpperCase(), L, yy)
  }
  const big = (text, yy, px = 132) => {
    g.font = `800 ${px}px ${FONT}`
    g.fillStyle = '#fff'
    g.fillText(fit(g, text, W - 2 * L), L, yy)
  }
  const small = (text, yy, alpha = 0.8, px = 40) => {
    g.font = `500 ${px}px ${FONT}`
    g.fillStyle = `rgba(255,255,255,${alpha})`
    g.fillText(fit(g, text, W - 2 * L), L, yy)
  }
  const head = `My ${y.year} in music`

  if (slide === 'intro') {
    g.font = `700 76px ${FONT}`
    g.fillStyle = '#fff'
    g.fillText(head, L, 300)
    if (y.since)
      small(
        `since ${new Date(y.since).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`,
        360,
        0.7,
        36
      )
    big(hours(y.ms), 720)
    small('of music', 790)
    big(String(y.plays), 1060, 120)
    small(
      `plays · ${y.songs} ${y.songs === 1 ? 'song' : 'songs'} · ${y.artists} ${y.artists === 1 ? 'artist' : 'artists'}`,
      1130
    )
    big(String(y.days), 1400, 120)
    small(y.days === 1 ? 'day with music' : 'days with music', 1470)
  } else if (slide === 'songs') {
    label(head, 260)
    g.font = `700 76px ${FONT}`
    g.fillStyle = '#fff'
    g.fillText('Your top songs', L, 350)
    const size = 160
    y.topSongs.slice(0, 5).forEach((s, i) => {
      const yy = 460 + i * 230
      g.font = `700 52px ${FONT}`
      g.fillStyle = 'rgba(255,255,255,0.55)'
      g.fillText(String(i + 1), L, yy + size / 2 + 18)
      const x = L + 70
      const img = covers[i]
      g.save()
      rounded(g, x, yy, size, size, 20)
      g.clip()
      if (img) {
        const k = Math.max(size / img.width, size / img.height)
        g.drawImage(
          img,
          x + (size - img.width * k) / 2,
          yy + (size - img.height * k) / 2,
          img.width * k,
          img.height * k
        )
      } else {
        g.fillStyle = 'rgba(255,255,255,0.12)'
        g.fillRect(x, yy, size, size)
      }
      g.restore()
      const tx = x + size + 40
      g.fillStyle = '#fff'
      g.font = `600 46px ${FONT}`
      g.fillText(fit(g, s.title, W - tx - L), tx, yy + 68)
      g.fillStyle = 'rgba(255,255,255,0.7)'
      g.font = `400 36px ${FONT}`
      g.fillText(
        fit(g, `${s.artist} · ${s.plays} ${s.plays === 1 ? 'play' : 'plays'}`, W - tx - L),
        tx,
        yy + 120
      )
    })
  } else if (slide === 'artists') {
    label(head, 260)
    g.font = `700 76px ${FONT}`
    g.fillStyle = '#fff'
    g.fillText('Your top artists', L, 350)
    y.topArtists.slice(0, 5).forEach((a, i) => {
      const yy = 560 + i * 230
      g.font = `800 ${i === 0 ? 92 : 70}px ${FONT}`
      g.fillStyle = i === 0 ? '#fff' : 'rgba(255,255,255,0.92)'
      g.fillText(fit(g, `${i + 1}  ${a.artist}`, W - 2 * L), L, yy)
      small(`${hours(a.ms)} · ${a.plays} ${a.plays === 1 ? 'play' : 'plays'}`, yy + 64, 0.7, 36)
    })
  } else if (slide === 'moments') {
    label(head, 260)
    if (y.topDay) {
      label('Your biggest day', 440)
      big(dayName(y.topDay.date), 540, 64)
      small(
        `${hours(y.topDay.ms)} · ${y.topDay.plays} ${y.topDay.plays === 1 ? 'play' : 'plays'}`,
        610
      )
    }
    if (y.streak?.days > 1) {
      label('Longest run', 780)
      big(`${y.streak.days} days in a row`, 880, 64)
    }
    // time listened each month: one quiet series, a bar per month with any music
    label('Month by month', 1100)
    const max = Math.max(...y.months, 1)
    const bw = (W - 2 * L) / 12
    const base = 1560
    y.months.forEach((ms, m) => {
      if (ms > 0) {
        const h = Math.max(6, (ms / max) * 360)
        g.fillStyle = 'rgba(255,255,255,0.85)'
        rounded(g, L + m * bw + 6, base - h, bw - 12, h, 8)
        g.fill()
      }
      g.font = `500 26px ${FONT}`
      g.fillStyle = 'rgba(255,255,255,0.55)'
      g.textAlign = 'center'
      g.fillText(
        new Date(y.year, m, 1).toLocaleDateString(undefined, { month: 'narrow' }),
        L + m * bw + bw / 2,
        base + 44
      )
      g.textAlign = 'left'
    })
  } else if (slide === 'line' && fav) {
    label(head, 260)
    label('A line you loved', 640)
    g.font = `700 76px ${FONT}`
    g.fillStyle = '#fff'
    const rows = wrap(g, `“${fav.text}”`, W - 2 * L).slice(0, 7)
    rows.forEach((r, i) => g.fillText(r, L, 760 + i * 92))
    small(`${fav.title}${fav.artist ? ` · ${fav.artist}` : ''}`, 790 + rows.length * 92, 0.75, 38)
  }

  g.textAlign = 'center'
  g.font = `600 30px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fillText('Glowtide', W / 2, H - 70)
}

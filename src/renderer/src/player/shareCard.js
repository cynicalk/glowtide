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

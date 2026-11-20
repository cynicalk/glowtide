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

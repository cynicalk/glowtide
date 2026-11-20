// Development only: records the frames of the demo video (GLOWTIDE_RECORD=1 with
// GLOWTIDE_SNAPSHOT=<folder> and GLOWTIDE_DEMO=1). Glowtide's real screens are drawn into
// offscreen windows (nothing shows on the screen), scene by scene, and saved as JPEG frames
// with a timeline; scripts/make-demo.cjs then adds captions and music and writes the MP4.

import { BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const W = 1280
const H = 720
const FPS = 30

export async function runRecord(c, dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = join(dir, 'frames')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  // the real windows stay out of sight while the demo is drawn offscreen
  const hideReal = () => {
    for (const w of [c.player, c.lyricsWin, ...c.glowWins, c.miniWin])
      if (w && !w.isDestroyed() && w.isVisible()) w.hide()
  }
  hideReal()

  const wins = []
  const make = (route) => {
    const w = new BrowserWindow({
      show: false,
      width: W,
      height: H,
      useContentSize: true,
      frame: false,
      webPreferences: { ...c.prefs, offscreen: true }
    })
    w.webContents.setFrameRate(FPS)
    w.latest = null
    w.webContents.on('paint', (_e, _dirty, img) => (w.latest = img))
    c.load(w, route)
    wins.push(w)
    return w
  }
  const push = () => {
    for (const w of wins) {
      if (w.isDestroyed()) continue
      w.webContents.send('state', c.state)
      w.webContents.send('settings', c.loadSettings())
    }
  }
  const pushLyrics = () => {
    for (const w of wins) if (!w.isDestroyed()) w.webContents.send('lyrics', c.lyrics)
  }
  const set = async (patch, ms = 700) => {
    c.setSettings(patch)
    hideReal()
    push()
    pushLyrics()
    await wait(ms)
  }

  await set({
    tourDone: true,
    hints: false,
    fps: 60,
    background: { kind: 'flow', fullscreen: true },
    glow: {
      enabled: true,
      gradient: 2,
      animation: 'music',
      thickness: 6,
      spread: 50,
      intensity: 85
    },
    lyrics: { style: 'stack', backdrop: 'none', size: 110, showClock: false, spacing: 100 },
    colour: { lyricsOwn: false },
    mini: { enabled: false, like: true, shuffle: false, repeat: true },
    widgets: { stage: { style: 'ring', theme: 'album' } }
  })

  const player = make('player')
  const show = make('showcase')
  const stage = make('stage')
  const cmd = make('showcase?cmd=1')
  const ticker = setInterval(push, 300)
  await wait(3000)
  pushLyrics()
  // the player shows its lyrics beside the cover
  await player.webContents.executeJavaScript(
    `!document.querySelector('.np.lyrics-open') && document.querySelector('.rail [aria-label="Lyrics in this window"]')?.click(); 1`
  )

  const type = (text) =>
    cmd.webContents.executeJavaScript(
      `(() => { const i = document.querySelector('.cmd-field input'); if (!i) return 0; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`
    )

  const scenes = [
    {
      win: player,
      secs: 6,
      caption: 'Your music, in the album’s colours, lyrics in time'
    },
    {
      win: show,
      secs: 6,
      caption: 'An edge glow and word-by-word lyrics on your desktop',
      setup: () => set({ lyrics: { style: 'stack', backdrop: 'none' } })
    },
    {
      win: show,
      secs: 5,
      caption: 'Seven lyric styles · Messages',
      setup: () => set({ lyrics: { style: 'messages', backdrop: 'flow', dim: 70 } })
    },
    {
      win: show,
      secs: 4,
      caption: 'Constellation: every word lights a star',
      setup: () => set({ lyrics: { style: 'constellation', backdrop: 'dim', dim: 45 } })
    },
    {
      win: stage,
      secs: 4,
      caption: 'Full screen, with the visualizer round the cover'
    },
    {
      win: cmd,
      secs: 5,
      caption: 'Ctrl+Alt+G: play anything, or type a command',
      setup: () => set({ lyrics: { style: 'stack', backdrop: 'none' } }),
      script: {
        6: 'n',
        10: 'ne',
        14: 'nex',
        18: 'next',
        44: 'vo',
        48: 'vol',
        52: 'volume',
        58: 'volume 4',
        62: 'volume 40'
      }
    }
  ]

  const timeline = { fps: FPS, width: W, height: H, scenes: [] }
  let n = 0
  for (const s of scenes) {
    if (s.setup) await s.setup()
    await wait(600) // settle: nothing half-drawn in the first frame
    const start = n
    const frames = s.secs * FPS
    const t0 = Date.now()
    for (let f = 0; f < frames; f++) {
      if (s.script?.[f] !== undefined) await type(s.script[f])
      const img = s.win.latest
      if (img && !img.isEmpty())
        writeFileSync(join(out, `f${String(n).padStart(5, '0')}.jpg`), img.toJPEG(88))
      n++
      // real time, so the lyrics and animations move at their own pace
      const due = t0 + ((f + 1) * 1000) / FPS
      await wait(Math.max(0, due - Date.now()))
    }
    timeline.scenes.push({ start, end: n, caption: s.caption })
  }
  timeline.frames = n
  writeFileSync(join(dir, 'timeline.json'), JSON.stringify(timeline, null, 1))
  clearInterval(ticker)
  for (const w of wins) if (!w.isDestroyed()) w.destroy()
  c.quit()
}

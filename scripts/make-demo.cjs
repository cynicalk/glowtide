// The demo video, from frames recorded by Glowtide (GLOWTIDE_RECORD, src/main/record.js):
//
//   npx electron scripts/make-demo.cjs <frames folder's parent> <out.mp4>
//
// Adds a title card, a caption per scene and an end card, and a soundtrack written here in
// code (so there is no third-party music and nothing to license). Everything happens in an
// offscreen window: the music is recorded straight into the file and never plays aloud.

const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

const [dir, out] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('.cjs'))
const timeline = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'))
const frames = fs
  .readdirSync(path.join(dir, 'frames'))
  .filter((f) => f.endsWith('.jpg'))
  .sort()
  .map((f) => path.join(dir, 'frames', f))

app.whenReady().then(async () => {
  const w = new BrowserWindow({
    show: false,
    width: timeline.width,
    height: timeline.height,
    useContentSize: true,
    webPreferences: { offscreen: true, nodeIntegration: true, contextIsolation: false }
  })
  w.webContents.setFrameRate(timeline.fps)
  ipcMain.on('done', (_e, buf, type) => {
    fs.writeFileSync(out, Buffer.from(buf))
    console.log(`saved ${out} (${type}, ${(buf.byteLength / 1e6).toFixed(1)} MB)`)
    app.quit()
  })
  ipcMain.on('log', (_e, m) => console.log(m))
  w.webContents.on('console-message', (e) => console.log('[page]', e.message || e))
  const html = `<body style="margin:0;background:#000"><canvas id=c width=${timeline.width} height=${timeline.height}></canvas></body>`
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await w.webContents
    .executeJavaScript(`(${page.toString()})(${JSON.stringify({ timeline, frames })})`)
    .catch((e) => {
      console.error('page failed:', e.message)
      app.exit(1)
    })
})

// ---------------------------------------------------------------- runs in the page
function page({ timeline, frames }) {
  const { ipcRenderer } = require('electron')
  const fs = require('fs')
  const { fps, width: W, height: H } = timeline
  const N = frames.length
  const SECS = N / fps
  const c = document.getElementById('c')
  const g = c.getContext('2d')

  // ---------- the soundtrack: an original loop, 100 bpm, Am – F – C – G ----------
  async function compose() {
    const sr = 48000
    const ctx = new OfflineAudioContext(2, Math.ceil((SECS + 0.5) * sr), sr)
    const master = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp).connect(ctx.destination)
    master.gain.setValueAtTime(0, 0)
    master.gain.linearRampToValueAtTime(0.9, 1.2)
    master.gain.setValueAtTime(0.9, SECS - 2.2)
    master.gain.linearRampToValueAtTime(0, SECS)
    const beat = 60 / 100
    const bar = beat * 4
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12)
    // chords as MIDI notes, two bars each
    const chords = [
      [57, 60, 64], // A minor
      [53, 57, 60], // F
      [48, 52, 55], // C
      [55, 59, 62] // G
    ]
    const roots = [33, 29, 36, 31]
    const echo = ctx.createDelay(1)
    echo.delayTime.value = beat * 0.75
    const fb = ctx.createGain()
    fb.gain.value = 0.32
    echo.connect(fb).connect(echo)
    echo.connect(master)
    const noise = ctx.createBuffer(1, sr, sr)
    const nd = noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

    const env = (node, t, a, peak, d) => {
      node.gain.setValueAtTime(0, t)
      node.gain.linearRampToValueAtTime(peak, t + a)
      node.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
    }
    for (let b = 0; b * bar < SECS; b++) {
      const t = b * bar
      const k = Math.floor(b / 2) % 4
      // pad: two detuned saws through a soft filter, held for the bar
      if (b % 2 === 0)
        for (const m of chords[k])
          for (const det of [-7, 7]) {
            const o = ctx.createOscillator()
            o.type = 'sawtooth'
            o.frequency.value = hz(m)
            o.detune.value = det
            const f = ctx.createBiquadFilter()
            f.type = 'lowpass'
            f.frequency.value = 1100
            const v = ctx.createGain()
            v.gain.setValueAtTime(0, t)
            v.gain.linearRampToValueAtTime(0.022, t + 0.6)
            v.gain.setValueAtTime(0.022, t + bar * 2 - 0.5)
            v.gain.linearRampToValueAtTime(0, t + bar * 2 + 0.3)
            o.connect(f).connect(v).connect(master)
            o.start(t)
            o.stop(t + bar * 2 + 0.4)
          }
      // bass on the beat and the and-of-two
      for (const off of [0, 1.5, 2, 3]) {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = hz(roots[k])
        const v = ctx.createGain()
        env(v, t + off * beat, 0.01, 0.22, beat * 0.8)
        o.connect(v).connect(master)
        o.start(t + off * beat)
        o.stop(t + off * beat + beat)
      }
      // arpeggio in eighths, into the echo
      if (b >= 1)
        for (let e = 0; e < 8; e++) {
          const notes = chords[k]
          const m = notes[[0, 1, 2, 1, 2, 0, 2, 1][e]] + 12
          const o = ctx.createOscillator()
          o.type = 'triangle'
          o.frequency.value = hz(m)
          const v = ctx.createGain()
          const tt = t + (e * beat) / 2
          env(v, tt, 0.005, 0.05, 0.25)
          o.connect(v)
          v.connect(master)
          v.connect(echo)
          o.start(tt)
          o.stop(tt + 0.3)
        }
      // drums: kick on every beat, a clap on two and four, hats on the off-beats
      for (let q = 0; q < 4; q++) {
        const tt = t + q * beat
        if (b >= 1) {
          const o = ctx.createOscillator()
          o.frequency.setValueAtTime(130, tt)
          o.frequency.exponentialRampToValueAtTime(42, tt + 0.14)
          const v = ctx.createGain()
          env(v, tt, 0.002, 0.55, 0.28)
          o.connect(v).connect(master)
          o.start(tt)
          o.stop(tt + 0.32)
        }
        if (b >= 3 && (q === 1 || q === 3)) {
          const s = ctx.createBufferSource()
          s.buffer = noise
          const f = ctx.createBiquadFilter()
          f.type = 'bandpass'
          f.frequency.value = 1800
          const v = ctx.createGain()
          env(v, tt, 0.002, 0.16, 0.16)
          s.connect(f).connect(v).connect(master)
          s.start(tt, Math.random() * 0.5, 0.2)
        }
        if (b >= 2) {
          const s = ctx.createBufferSource()
          s.buffer = noise
          const f = ctx.createBiquadFilter()
          f.type = 'highpass'
          f.frequency.value = 7500
          const v = ctx.createGain()
          const th = tt + beat / 2
          env(v, th, 0.001, 0.07, 0.05)
          s.connect(f).connect(v).connect(master)
          s.start(th, Math.random() * 0.5, 0.08)
        }
      }
    }
    return ctx.startRendering()
  }

  // ---------- frames, decoded a little ahead ----------
  const cache = new Map()
  const load = (i) => {
    if (i < 0 || i >= N || cache.has(i)) return
    cache.set(i, createImageBitmap(new Blob([fs.readFileSync(frames[i])], { type: 'image/jpeg' })))
  }
  for (let i = 0; i < 45; i++) load(i)

  const sceneAt = (i) =>
    timeline.scenes.find((s) => i >= s.start && i < s.end) || timeline.scenes[0]
  const ease = (x) => Math.max(0, Math.min(1, x))

  function caption(text, alpha) {
    if (alpha <= 0) return
    g.save()
    g.globalAlpha = alpha
    g.font = '600 26px "Segoe UI Variable Display", "Segoe UI", sans-serif'
    const tw = g.measureText(text).width
    const x = 40
    const y = H - 44
    g.fillStyle = 'rgba(12, 10, 16, 0.72)'
    g.beginPath()
    g.roundRect(x - 18, y - 34, tw + 36, 50, 25)
    g.fill()
    g.fillStyle = '#f6efe8'
    g.fillText(text, x, y)
    g.restore()
  }

  function card(title, sub, alpha) {
    if (alpha <= 0) return
    g.save()
    g.globalAlpha = alpha
    g.fillStyle = 'rgba(8, 7, 11, 0.78)'
    g.fillRect(0, 0, W, H)
    g.textAlign = 'center'
    g.fillStyle = '#ffffff'
    g.font = '700 76px "Segoe UI Variable Display", "Segoe UI", sans-serif'
    g.fillText(title, W / 2, H / 2 - 6)
    g.fillStyle = 'rgba(246, 239, 232, 0.8)'
    g.font = '400 26px "Segoe UI Variable Display", "Segoe UI", sans-serif'
    sub.split('\n').forEach((line, k) => g.fillText(line, W / 2, H / 2 + 46 + k * 36))
    g.restore()
  }

  async function draw(i) {
    load(i + 45)
    const bmp = await cache.get(i)
    if (bmp) g.drawImage(bmp, 0, 0, W, H)
    cache.delete(i - 1)
    const s = sceneAt(i)
    // a short dip at each cut
    const into = i - s.start
    if (into < 6 && s.start > 0) {
      g.fillStyle = `rgba(0,0,0,${0.6 * (1 - into / 6)})`
      g.fillRect(0, 0, W, H)
    }
    const t = i / fps
    const titleA = t < 1.6 ? 1 : 1 - ease((t - 1.6) / 0.5)
    const endA = ease((t - (SECS - 1.9)) / 0.4)
    const capA = Math.min(ease(into / 8), ease((s.end - i) / 8)) * (1 - titleA) * (1 - endA)
    caption(s.caption, capA)
    card('Glowtide', 'A music companion for Windows', titleA)
    card('Glowtide', 'Free and open source\ngithub.com/cynicalk/glowtide', endA)
  }

  ;(async () => {
    const audio = await compose()
    const ac = new AudioContext({ sampleRate: audio.sampleRate })
    const dest = ac.createMediaStreamDestination() // into the recording only, never the speakers
    const src = ac.createBufferSource()
    src.buffer = audio
    src.connect(dest)
    const stream = new MediaStream([
      ...c.captureStream(fps).getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ])
    const type = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/webm;codecs=vp9,opus'
    ].find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: 8e6,
      audioBitsPerSecond: 192e3
    })
    const parts = []
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
    rec.onstop = async () => ipcRenderer.send('done', await new Blob(parts).arrayBuffer(), type)
    await draw(0)
    rec.start(1000)
    src.start()
    const t0 = ac.currentTime
    let last = -1
    const tick = async () => {
      const i = Math.floor((ac.currentTime - t0) * fps)
      if (i >= N) {
        setTimeout(() => rec.stop(), 200)
        return
      }
      if (i !== last) {
        last = i
        await draw(i)
      }
      setTimeout(tick, 4)
    }
    tick()
  })().catch((e) => ipcRenderer.send('log', 'ERROR ' + e.stack))
}

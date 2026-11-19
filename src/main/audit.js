// GLOWTIDE_AUDIT (development runs only): click through every button and change every setting
// in the running app, checking each one has the effect it should, into audit.json. Kept out
// of index.js; index.js loads it only for a development run that asks for it.

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { screen } from 'electron'

/**
 * c: the running app. player, lyricsWin, glowWins, quickWin and widgets are read through c
 * each time (they are replaced as windows come and go); the rest are its functions.
 */
// Samples every frame for 8 s: how far each message moves between frames (the largest step)
// and how many times one moved at all, plus the bubbles that opened out as they grew.
const MOTION_PROBE = `new Promise((done) => {
  const last = new Map()
  let maxStep = 0, moves = 0, grew = 0, frames = 0
  const t0 = performance.now()
  const frame = () => {
    frames++
    for (const row of document.querySelectorAll('.msgs .msg:not(.age-3)')) {
      const top = row.getBoundingClientRect().top
      const k = row.dataset.k
      if (last.has(k)) {
        const d = Math.abs(top - last.get(k))
        if (d > 0.5) moves++
        maxStep = Math.max(maxStep, d)
      }
      last.set(k, top)
      if (row.firstElementChild.getAnimations().some((a) => a.effect?.getKeyframes()[0]?.clipPath)) grew++
    }
    if (performance.now() - t0 < 8000) requestAnimationFrame(frame)
    else done({ maxStep: Math.round(maxStep * 10) / 10, moves, grew, frames })
  }
  requestAnimationFrame(frame)
})`

export async function runAudit(c, dir) {
  const { state, setSettings, loadSettings, updateSettings, sendSettings, control } = c
  const { toggleQuick, fullscreen } = c

  const results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail })
  const js = (w, code) =>
    w && !w.isDestroyed() ? w.webContents.executeJavaScript(code).catch((e) => `ERR ${e}`) : null
  const p = (code) => js(c.player, code)
  const click = (sel) =>
    p(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'ok' })()`
    )
  const has = (w, sel) => js(w, `!!document.querySelector(${JSON.stringify(sel)})`)
  const step = async (name, fn) => {
    try {
      await fn()
    } catch (e) {
      check(name, false, `threw: ${e?.message || e}`)
    }
  }
  const set = async (patch, ms = 900) => {
    setSettings(patch)
    await wait(ms)
  }
  const s0 = JSON.parse(JSON.stringify(loadSettings()))

  // ---------- the player: sidebar pages ----------
  await step('sidebar pages', async () => {
    for (const [label, title] of [
      ['Library', 'Library'],
      ['Search', 'Search'],
      ['Queue', 'Queue'],
      ['Settings', 'Settings']
    ]) {
      const r = await click(`.sidebar [aria-label="${label}"]`)
      await wait(300)
      const head = await p(`document.querySelector('.sheet-head span')?.textContent`)
      const lit = await has(c.player, `.sidebar [aria-label="${label}"].on`)
      check(`sidebar: ${label} opens its page`, r === 'ok' && head === title && lit, {
        r,
        head,
        lit
      })
    }
    await click('.sidebar [aria-label="Now playing"]')
    await wait(300)
    check('sidebar: Now playing closes the page', !(await has(c.player, '.sheet')))
    const dev = await click('.sidebar [aria-label="Devices"]')
    check('sidebar: Devices is unavailable in the demo', dev === 'disabled', dev)
  })

  // ---------- settings tabs ----------
  await step('settings tabs', async () => {
    await click('.sidebar [aria-label="Settings"]')
    await wait(300)
    for (const [tab, heading] of [
      ['Glow', 'Edge glow'],
      ['Lyrics', 'Lyrics overlay'],
      ['Colours', 'Colours'],
      ['Full screen', 'Full screen'],
      ['App', 'Glowtide']
    ]) {
      await p(
        `[...document.querySelectorAll('.set-tabs button')].find((b) => b.textContent === ${JSON.stringify(tab)})?.click()`
      )
      await wait(250)
      const hs = await p(`[...document.querySelectorAll('.settings h3')].map((h) => h.textContent)`)
      check(`settings tab: ${tab}`, Array.isArray(hs) && hs.includes(heading), hs)
    }
    const noClock = await p(
      `![...document.querySelectorAll('.settings h3')].some((h) => /clock|visualizer/i.test(h.textContent))`
    )
    check('settings: no desktop clock or visualizer section', noClock)
    await click('.sidebar [aria-label="Now playing"]')
    await wait(300)
  })

  // ---------- the rail ----------
  await step('rail', async () => {
    // start from the cover view (the window remembers lyrics left open last time)
    if (await has(c.player, '.np.lyrics-open'))
      await click('.rail [aria-label="Lyrics in this window"]')
    await wait(300)
    await click('.rail [aria-label="Lyrics in this window"]')
    await wait(500)
    check(
      'rail: lyrics show in the window',
      (await has(c.player, '.np.lyrics-open')) && (await has(c.player, '.pl-lyrics'))
    )
    await click('.rail [aria-label="Lyrics in this window"]')
    await wait(300)
    check('rail: lyrics hide again', !(await has(c.player, '.np.lyrics-open')))

    await click('.rail [aria-label="Fill the window with the cover"]')
    await wait(400)
    check('rail: cover fills the window', await has(c.player, '.np.immersive'))
    await p(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
    await wait(300)
    check('Esc shrinks the cover back', !(await has(c.player, '.np.immersive')))
    await click('.cover')
    await wait(300)
    check('clicking the cover fills the window', await has(c.player, '.np.immersive'))
    await click('.immersive-art')
    await wait(300)
    check('clicking the full cover shrinks it', !(await has(c.player, '.np.immersive')))

    // lyrics in the window and the full cover take turns: the rail never shows both lit
    await click('.rail [aria-label="Lyrics in this window"]')
    await wait(400)
    await click('.rail [aria-label="Fill the window with the cover"]')
    await wait(400)
    check(
      'cover replaces lyrics in the window',
      (await has(c.player, '.np.immersive')) &&
        !(await has(c.player, '.np.lyrics-open')) &&
        !(await has(c.player, '.rail [aria-label="Lyrics in this window"].on'))
    )
    // with a page open over the cover, Esc closes the page and leaves the cover
    await click('.sidebar [aria-label="Queue"]')
    await wait(300)
    await p(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
    await wait(300)
    check(
      'Esc closes a page first, keeping the cover',
      !(await has(c.player, '.sheet')) && (await has(c.player, '.np.immersive'))
    )
    await p(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
    await wait(300)
    const syncClip = await p(
      `(() => { const x = document.querySelector('.sync-xp'); return x ? getComputedStyle(x).overflow : 'missing' })()`
    )
    check('the Sync hint is not clipped', syncClip === 'visible', syncClip)

    const ov = loadSettings().lyrics.overlay
    await click('.rail [aria-label="Lyrics on the desktop"]')
    await wait(900)
    check(
      'rail: desktop lyrics turn off',
      loadSettings().lyrics.overlay === !ov && !c.lyricsWin === ov
    )
    await click('.rail [aria-label="Lyrics on the desktop"]')
    await wait(1200)
    check(
      'rail: desktop lyrics turn back on',
      loadSettings().lyrics.overlay === ov && !!c.lyricsWin === ov
    )

    await click('.rail .qx > button')
    await wait(900)
    check(
      'rail: the bulb turns the glow off',
      !loadSettings().glow.enabled && c.glowWins.length === 0
    )
    await click('.rail .qx > button')
    await wait(1200)
    check('rail: the bulb turns it back on', loadSettings().glow.enabled && c.glowWins.length > 0)

    await click('.rail [aria-label="Full screen"]')
    await wait(1500)
    check('rail: full screen opens', c.widgets?.windows().length === 1)
    c.widgets?.closeStage()
    await wait(600)
    check('full screen closes', c.widgets?.windows().length === 0)
  })

  // ---------- playback ----------
  await step('playback', async () => {
    await control('seek', 2000)
    await wait(600)
    const before = state.playback?.progressMs ?? 0
    await click('[aria-label="Forward 15 seconds"]')
    await wait(700)
    const after = state.playback?.progressMs ?? 0
    check('forward 15 s', after - before >= 14000, { before, after })
    await click('[aria-label="Back 15 seconds"]')
    await wait(700)
    check(
      'back 15 s',
      (state.playback?.progressMs ?? 0) < after - 12000,
      state.playback?.progressMs
    )
    await click('.controls [aria-label="Pause"]')
    await wait(500)
    check('pause', state.playback?.isPlaying === false)
    await click('.controls [aria-label="Play"]')
    await wait(500)
    check('play', state.playback?.isPlaying === true)
    const t0 = state.track?.id
    await click('.controls [aria-label="Next"]')
    await wait(900)
    check('next song', state.track?.id && state.track.id !== t0, [t0, state.track?.id])
    await click('.controls [aria-label="Previous"]')
    await wait(900)
    check('previous song', state.track?.id === t0, [t0, state.track?.id])
    const sh = !!state.playback?.shuffle
    await click('.controls [aria-label="Shuffle"]')
    await wait(500)
    check('shuffle', !!state.playback?.shuffle === !sh)
    await click('.controls [aria-label="Shuffle"]')
    const rp = state.playback?.repeat || 'off'
    await click('.controls [aria-label="Repeat"]')
    await wait(500)
    check('repeat', (state.playback?.repeat || 'off') !== rp, [rp, state.playback?.repeat])
    const like = await click('[aria-label="Save to liked songs"]')
    check('like is only for Spotify', like === 'disabled', like)
    await p(`document.querySelector('[aria-label="Lyrics later"]')?.click()`)
    await wait(400)
    check('lyrics sync +', state.lyricsOffsetMs === 250, state.lyricsOffsetMs)
    await p(`document.querySelector('[aria-label="Lyrics earlier"]')?.click()`)
    await wait(400)
    check('lyrics sync -', state.lyricsOffsetMs === 0, state.lyricsOffsetMs)
  })

  // ---------- hints ----------
  await step('hints', async () => {
    await set({ hints: false }, 500)
    check('button hints can be turned off', await has(c.player, '.player.no-hints'))
    await set({ hints: true }, 500)
    check('button hints back on', !(await has(c.player, '.player.no-hints')))
    const missing = await p(
      `[...document.querySelectorAll('.sidebar button, .rail button, .controls button, .dock button')].filter((b) => !b.dataset.tip && !b.closest('.qx')).map((b) => b.getAttribute('aria-label'))`
    )
    check('every button has a hint', Array.isArray(missing) && missing.length === 0, missing)
  })

  // ---------- the edge glow ----------
  const flow = async () => {
    const read = () =>
      js(c.glowWins[0], `document.querySelector('.flow-frame i')?.style.transform || ''`)
    const a = await read()
    await wait(600)
    return [a, await read()]
  }
  await step('glow', async () => {
    await set({ glow: { gradient: 1 } }, 800)
    check(
      'glow: 1 colour',
      (await has(c.glowWins[0], '.edge')) && !(await has(c.glowWins[0], '.edge-duo'))
    )
    await set({ glow: { gradient: 2 } }, 800)
    check('glow: 2 colours', await has(c.glowWins[0], '.edge-duo'))
    for (const [a, moves] of [
      ['default', true],
      ['music', true],
      ['idle', true],
      ['none', false]
    ]) {
      await set({ glow: { animation: a } }, 700)
      const [x, y] = await flow()
      check(`glow animation: ${a}`, moves ? x !== y : x === y, [x, y])
    }
    await set({ glow: { animation: 'music' } })
    await set({ glow: { taskbar: false } }, 1200)
    const full = c.glowWins[0]?.getBounds().height
    await set({ glow: { taskbar: true } }, 1200)
    const clear = c.glowWins[0]?.getBounds().height
    const d = screen.getPrimaryDisplay()
    check('glow: behind the taskbar covers the screen', full === d.bounds.height, full)
    check('glow: clear of the taskbar stops at it', clear === d.workArea.height, clear)
    await set({ glow: { displays: 'primary' } }, 1200)
    check('glow: main display only', c.glowWins.length === 1)
    await set({ glow: { displays: d.id } }, 1200)
    check(
      'glow: a chosen display',
      c.glowWins.length === 1 && c.glowWins[0].getBounds().x === d.workArea.x
    )
    await set({ glow: { displays: 'all' } }, 1200)
    check('glow: all displays', c.glowWins.length === screen.getAllDisplays().length)
    await set({ colour: { source: 'custom', custom: '#ff0000', custom2: '#00ff00' } }, 1500)
    const glowColours = await js(
      c.glowWins[0],
      `getComputedStyle(document.querySelector('.edge-duo')).getPropertyValue('--c') + '|' + getComputedStyle(document.querySelector('.edge-duo')).getPropertyValue('--g2')`
    )
    check(
      'glow: override colours reach the glow',
      /ff0000|255, 0, 0/i.test(glowColours) && /00ff00|0, 255, 0/i.test(glowColours),
      glowColours
    )
    await set({ colour: { source: 'album' } })
  })

  // ---------- the lyrics overlay ----------
  await step('lyrics overlay', async () => {
    const styles = ['stack', 'karaoke', 'constellation', 'aura', 'waves', 'beat', 'messages']
    for (const st of styles) {
      await set({ lyrics: { style: st } }, 2500)
      const r = await js(
        c.lyricsWin,
        `(() => { const l = document.querySelector('.lyr'); const st = document.querySelector('.lyr-stage'); return { cls: l?.className || '', shown: !!st?.classList.contains('show'), text: (st?.innerText || '').trim().length, svg: !!document.querySelector('.sky') } })()`
      )
      const ok = r && r.cls.includes(`s-${st}`) && r.shown && (r.text > 0 || r.svg)
      check(`lyrics style: ${st}`, ok, r)
    }
    await set({ lyrics: { style: 'stack', showClock: false } }, 900)
    check('lyrics: clock off', !(await has(c.lyricsWin, '.clock')))
    await set({ lyrics: { showClock: true } }, 900)
    check('lyrics: clock on', await has(c.lyricsWin, '.clock'))
    for (const [b, sel] of [
      ['dim', '.dim'],
      ['cover', '.backdrop-art'],
      ['none', null]
    ]) {
      await set({ lyrics: { backdrop: b } }, 900)
      const r = sel ? await has(c.lyricsWin, sel) : !(await has(c.lyricsWin, '.dim, .backdrop-art'))
      check(`lyrics backdrop: ${b}`, r)
    }
    const big = () =>
      js(c.lyricsWin, `document.querySelector('.lyr').style.getPropertyValue('--big')`)
    await set({ lyrics: { size: 60 } }, 700)
    const small = await big()
    await set({ lyrics: { size: 150 } }, 700)
    check('lyrics: size', small !== (await big()), [small, await big()])
    await set({ lyrics: { style: 'messages' } }, 500)
    await click('.cover')
    await wait(2500)
    check('messages over the full cover in the player', await has(c.player, '.np-msgs .msg'))
    await p(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
    await wait(300)
    await click('.rail [aria-label="Lyrics in this window"]')
    await wait(2500)
    check('messages in the player lyrics view', await has(c.player, '.pl-msgs .msg'))
    // smooth, not stiff: over 8 s of song, no message ever jumps; each one glides
    // the overlay steps its animations at its own frame rate: measured at 60, like the player
    const fps0 = loadSettings().fps
    await set({ fps: 60 }, 800)
    for (const [where, w] of [
      ['player', c.player],
      ['overlay', c.lyricsWin]
    ]) {
      const m = await js(w, MOTION_PROBE)
      check(
        `messages glide in the ${where} (no jump over 14 px a frame)`,
        m && m.moves > 0 && m.maxStep <= 14,
        m
      )
    }
    await set({ fps: fps0 }, 500)
    await click('.rail [aria-label="Lyrics in this window"]')
  })

  // ---------- the app ----------
  await step('app', async () => {
    toggleQuick()
    await wait(1500)
    const qt = await js(c.quickWin, `document.body.innerText`)
    check(
      'tray: quick panel opens with the glow choices',
      c.quickWin?.isVisible() && /Gradient/.test(qt || '') && /Animation/.test(qt || '')
    )
    c.quickWin?.hide()
    await set({ hideForFullscreen: false }, 600)
    check('full-screen apps: watcher stops when off', !fullscreen.running())
    await set({ hideForFullscreen: true }, 600)
    check('full-screen apps: watcher runs when on', fullscreen.running())
    await set({ fps: 60 }, 600)
    check(
      'frame rate: 60 reaches the glow',
      (await js(c.glowWins[0], `1`)) === 1 && loadSettings().fps === 60
    )
    await set({ fps: 30 }, 300)
    check(
      'desktop clock is gone',
      !loadSettings().widgets.clock && !(await has(c.player, '[aria-label="Desktop clock"]'))
    )
  })

  // put the settings back as they were
  updateSettings(s0)
  sendSettings()
  mkdirSync(dir, { recursive: true })
  const failed = results.filter((r) => !r.ok)
  writeFileSync(
    join(dir, 'audit.json'),
    JSON.stringify(
      { passed: results.length - failed.length, failed: failed.length, results },
      null,
      1
    )
  )
  c.quit()
}

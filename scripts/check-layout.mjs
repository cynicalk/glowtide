// The player's layout at several window sizes: opens the built app (demo songs, sound off, a
// throwaway settings folder) small, normal, wide and maximised, and checks the now-playing
// column: everything inside the window and below the title bar, the song's title on screen,
// and nothing under the bottom bar. Tests can't see a layout; this can.
//
//   npm run check:layout        (builds first)
//
// Exits 1 if anything is off, and says what and where.

import { spawn } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import electron from 'electron'

const SIZES = [
  ['small', { GLOWTIDE_PLAYER_SIZE: '440,600' }],
  ['normal', { GLOWTIDE_PLAYER_SIZE: '1000,720' }],
  ['wide', { GLOWTIDE_PLAYER_SIZE: '1400,820' }],
  ['maximised', { GLOWTIDE_MAXIMIZE: '1' }]
]

// runs in the player window
const PROBE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await window.glowtide.setSettings({ tourDone: true })
  await wait(1800)
  const W = innerWidth, H = innerHeight
  const bar = document.querySelector('.titlebar')?.getBoundingClientRect().bottom || 0
  const problems = []
  const box = (el) => el.getBoundingClientRect()
  const seen = (el) => el && el.offsetParent !== null && box(el).width > 0 && box(el).height > 0
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '')
  const col = document.querySelector('.np-left')
  if (!col) return { W, H, problems: ['no now-playing column'] }
  for (const el of col.querySelectorAll('*')) {
    if (!seen(el) || el.closest('.yt-stage')) continue
    const b = box(el)
    if (b.left < -1 || b.right > W + 1 || b.bottom > H + 1 || b.top < bar - 1)
      problems.push(name(el) + ' outside the window at ' + [b.left, b.top, b.right, b.bottom].map(Math.round))
  }
  const title = col.querySelector('.title')
  if (!seen(title)) problems.push('the song title is not shown')
  const dock = document.querySelector('.dock')
  if (seen(dock)) {
    const d = box(dock)
    for (const el of col.querySelectorAll('*')) {
      if (!seen(el) || el.closest('.yt-stage') || dock.contains(el)) continue
      const b = box(el)
      if (b.bottom > d.top + 1 && b.top < d.bottom && b.right > d.left && b.left < d.right && el.children.length === 0)
        problems.push(name(el) + ' under the bottom bar')
    }
  }
  return { W, H, problems: [...new Set(problems)].slice(0, 12) }
})()`

function run(label, extra) {
  const dir = mkdtempSync(join(tmpdir(), 'glowtide-layout-'))
  const env = {
    ...process.env,
    GLOWTIDE_PROFILE: join(dir, 'profile'),
    GLOWTIDE_DEMO: '1',
    GLOWTIDE_SNAPSHOT: join(dir, 'snap'),
    GLOWTIDE_SNAPSHOT_MS: '10000',
    GLOWTIDE_PROBE_IN: 'player',
    GLOWTIDE_PROBE_AT: '5000',
    GLOWTIDE_PROBE_JS: PROBE,
    ...extra
  }
  return new Promise((resolve) => {
    const child = spawn(electron, ['.', '--mute-audio'], { env, stdio: 'ignore' })
    const kill = setTimeout(() => child.kill(), 45000)
    child.on('exit', () => {
      clearTimeout(kill)
      const file = join(dir, 'snap', 'probe.json')
      let out = null
      try {
        out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
      } catch {
        /* reported below */
      }
      rmSync(dir, { recursive: true, force: true })
      resolve({ label, out })
    })
  })
}

let bad = 0
for (const [label, extra] of SIZES) {
  const { out } = await run(label, extra)
  if (!out || typeof out !== 'object') {
    console.log(`✖ ${label}: the player didn't report (${JSON.stringify(out)})`)
    bad++
    continue
  }
  if (out.problems?.length) {
    bad++
    console.log(`✖ ${label} ${out.W}x${out.H}:`)
    for (const p of out.problems) console.log(`    ${p}`)
  } else console.log(`✓ ${label} ${out.W}x${out.H}`)
}
process.exit(bad ? 1 : 0)

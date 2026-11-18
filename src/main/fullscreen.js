// Supervises resources/fullscreen.ps1, which watches for another app filling a display (a
// game, a full-screen video, a presentation). onChange gets the display's bounds in
// physical pixels, or null when nothing is full screen.

import { spawn } from 'child_process'
import { POWERSHELL } from './powershell'
import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { parseFullscreenLine } from '../shared/fullscreen.mjs'

const script = () =>
  is.dev
    ? join(app.getAppPath(), 'resources', 'fullscreen.ps1')
    : join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'fullscreen.ps1')

export function createFullscreenWatch(onChange) {
  let child = null
  let wanted = false
  let restartTimer = null

  function start() {
    wanted = true
    if (child) return
    clearTimeout(restartTimer)
    let buf = ''
    child = spawn(
      POWERSHELL,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script(),
        String(process.pid)
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    )
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const v = parseFullscreenLine(buf.slice(0, nl).trim())
        buf = buf.slice(nl + 1)
        if (v !== undefined) onChange(v)
      }
    })
    const me = child
    me.on('exit', () => {
      if (child !== me) return
      child = null
      onChange(null) // nothing can be hidden on the word of a helper that isn't running
      // It died on its own: try again shortly, but not in a tight loop.
      if (wanted) restartTimer = setTimeout(start, 10000)
    })
    me.on('error', () => {})
  }

  function stop() {
    wanted = false
    clearTimeout(restartTimer)
    if (!child) return
    const c = child
    child = null
    c.stdin.end() // the helper exits when its input closes
    setTimeout(() => c.exitCode === null && c.kill(), 3000)
    onChange(null)
  }

  return { start, stop, running: () => !!child }
}

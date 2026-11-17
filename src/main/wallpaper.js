// Supervises resources/wallpaper.ps1, which re-parents windows into the desktop wallpaper
// (behind the icons and every application window). Requests are answered in order.

import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const script = () =>
  is.dev
    ? join(app.getAppPath(), 'resources', 'wallpaper.ps1')
    : join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'wallpaper.ps1')

const hwndOf = (win) => win.getNativeWindowHandle().readBigUInt64LE(0).toString()

export function createWallpaper() {
  let child = null
  let buf = ''
  const waiting = []

  function ensure() {
    if (child) return
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script()],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg.type === 'ready') continue
        waiting.shift()?.(msg)
      }
    })
    child.on('exit', () => {
      child = null
      buf = ''
      while (waiting.length) waiting.shift()({ result: 'error' })
    })
    child.on('error', () => {})
  }

  function ask(line) {
    ensure()
    return new Promise((resolve) => {
      waiting.push(resolve)
      child.stdin.write(`${line}\n`)
      setTimeout(() => {
        const i = waiting.indexOf(resolve)
        if (i >= 0) {
          waiting.splice(i, 1)
          resolve({ result: 'timeout' })
        }
      }, 8000)
    })
  }

  return {
    /** bounds in screen coordinates (DIP; scaled to pixels for Win32). */
    async attach(win, b, scale = 1) {
      const r = await ask(
        `attach ${hwndOf(win)} ${Math.round(b.x * scale)} ${Math.round(b.y * scale)} ${Math.round(b.width * scale)} ${Math.round(b.height * scale)}`
      )
      return r.result
    },
    async detach(win) {
      return (await ask(`detach ${hwndOf(win)}`)).result
    },
    async check(win) {
      return (await ask(`check ${hwndOf(win)}`)).result
    },
    stop() {
      child?.stdin.end()
      child = null
    }
  }
}

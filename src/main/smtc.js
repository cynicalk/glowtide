// Runs resources/smtc.ps1 (Windows media-session helper) and relays its JSON lines.
// Started only while the "Any app" source is selected, restarted if it dies.

import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

function scriptPath() {
  // Packaged: resources/** is unpacked from the asar next to it.
  return is.dev
    ? join(app.getAppPath(), 'resources', 'smtc.ps1')
    : join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'smtc.ps1')
}

export function createSmtc(onMessage) {
  let child = null
  let wanted = false
  let restarts = 0
  let buf = ''
  let selected = 'auto'

  function start() {
    if (child || !wanted) return
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()],
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
        try {
          const msg = JSON.parse(line)
          if (msg.type === 'ready') {
            restarts = 0
            if (selected !== 'auto') send(`select ${selected}`)
          }
          onMessage(msg)
        } catch {
          /* a partial or non-JSON line: ignore */
        }
      }
    })
    child.stderr.on('data', (d) => {
      if (process.env.GLOWTIDE_DEBUG) console.error('[smtc]', String(d).trim())
    })
    child.on('exit', (code) => {
      child = null
      buf = ''
      if (!wanted) return
      restarts++
      if (restarts > 5) {
        onMessage({
          type: 'error',
          message: "Couldn't read Windows media info (the helper keeps stopping).",
          fatal: true
        })
        return
      }
      onMessage({ type: 'error', message: `Media helper stopped (${code}), restarting…` })
      setTimeout(start, 1000 * restarts)
    })
    child.on('error', (e) => {
      onMessage({
        type: 'error',
        message: `Couldn't start Windows PowerShell: ${e.message}`,
        fatal: true
      })
    })
  }

  function send(line) {
    if (child?.stdin.writable) child.stdin.write(`${line}\n`)
  }

  return {
    start() {
      wanted = true
      restarts = 0
      start()
    },
    stop() {
      wanted = false
      if (child) {
        child.stdin.end() // the helper exits when stdin closes
        const c = child
        setTimeout(() => c.exitCode === null && c.kill(), 1500)
        child = null
      }
    },
    select(appId) {
      selected = appId || 'auto'
      send(`select ${selected}`)
    },
    send
  }
}

// How Glowtide starts its Windows PowerShell helpers (media sessions, full-screen apps).
import { join } from 'path'

/**
 * Windows PowerShell by its full system path. Started by bare name, Windows would look in
 * the current folder first, where a planted "powershell.exe" would run instead.
 */
export const POWERSHELL = join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
)

/** One command line for a helper: control characters (a newline would start a second
 * command) are removed, and the length is capped. */
export function oneLine(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '') // eslint-disable-line no-control-regex
    .slice(0, 512)
}

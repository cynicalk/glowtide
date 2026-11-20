// Global shortcuts you can set (Settings → App → Shortcuts). Pure: no Electron.

export const SHORTCUTS = [
  { id: 'command', label: 'Command bar', def: 'CommandOrControl+Alt+G' },
  { id: 'lyrics', label: 'Desktop lyrics on or off', def: 'CommandOrControl+Alt+L' },
  { id: 'fullscreen', label: 'Full-screen view', def: 'CommandOrControl+Alt+F' },
  { id: 'playPause', label: 'Play or pause', def: '' },
  { id: 'next', label: 'Next song', def: '' },
  { id: 'previous', label: 'Previous song', def: '' },
  { id: 'like', label: 'Like this song', def: '' },
  { id: 'mini', label: 'Mini player on or off', def: '' }
]

export const DEFAULT_SHORTCUTS = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.def]))

const MODS = ['CommandOrControl', 'Alt', 'Shift', 'Super']
const NAMED = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Enter',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack'
}
const KEY =
  /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Up|Down|Left|Right|Enter|Tab|Home|End|PageUp|PageDown|Insert|Delete|Plus|[-=,./;'[\]\\`]|MediaPlayPause|MediaNextTrack|MediaPreviousTrack)$/
const BARE_OK = /^(F([1-9]|1[0-9]|2[0-4])|MediaPlayPause|MediaNextTrack|MediaPreviousTrack)$/

/**
 * A key press as an Electron accelerator ("CommandOrControl+Alt+K"), or null while only
 * modifiers are held. e: a KeyboardEvent (or { key, code, ctrlKey, altKey, shiftKey, metaKey }).
 */
export function acceleratorFrom(e) {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return null
  let key = NAMED[e.key]
  if (!key && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  if (!key && /^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  if (!key && /^F\d{1,2}$/.test(e.key)) key = e.key
  if (!key && e.key === '+') key = 'Plus'
  if (!key && e.key?.length === 1) key = e.key.toUpperCase()
  if (!key) return null
  const parts = []
  if (e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  return [...parts, key].join('+')
}

/**
 * Whether an accelerator is one Glowtide will register: known modifiers, one key, and a
 * modifier other than Shift unless the key is a function or media key (a bare letter would
 * take that letter away from every other app).
 */
export function validAccelerator(acc) {
  if (typeof acc !== 'string' || acc.length > 60) return false
  const parts = acc.split('+')
  const key = parts.pop()
  if (!KEY.test(key)) return false
  if (new Set(parts).size !== parts.length || parts.some((p) => !MODS.includes(p))) return false
  return parts.some((p) => p !== 'Shift') || BARE_OK.test(key)
}

/** "CommandOrControl+Alt+G" → "Ctrl+Alt+G", for showing. */
export const prettyAccelerator = (acc) =>
  String(acc || '')
    .replace('CommandOrControl', 'Ctrl')
    .replace('Super', 'Win')

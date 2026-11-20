// The command bar (Ctrl+Alt+Space): what a typed line means. Pure: no Electron, no DOM.
//
//   "next", "pause", "shuffle"…     a command
//   "volume 40", "seek 1:30"         a command with a value
//   "play blinding lights"           search, and play the first song found
//   "queue levitating"               search, and add to the queue
//   anything else                    search
// Typing the start of a command ("sh") suggests the commands it could be.

export const COMMANDS = [
  { id: 'play', words: ['play', 'resume'], label: 'Play' },
  { id: 'pause', words: ['pause', 'stop'], label: 'Pause' },
  { id: 'next', words: ['next', 'skip'], label: 'Next song' },
  { id: 'previous', words: ['previous', 'prev', 'back'], label: 'Previous song' },
  { id: 'shuffle', words: ['shuffle'], label: 'Shuffle on or off' },
  { id: 'repeat', words: ['repeat', 'loop'], label: 'Repeat: off, all or this song' },
  { id: 'like', words: ['like', 'love', 'save'], label: 'Like this song (Spotify)' },
  { id: 'volume', words: ['volume', 'vol'], label: 'Volume', arg: '0 to 100' },
  { id: 'seek', words: ['seek', 'goto', 'jump'], label: 'Go to a time in the song', arg: '1:30' },
  { id: 'share', words: ['share', 'copy', 'link'], label: 'Copy the song and its link' },
  { id: 'lyrics', words: ['lyrics'], label: 'Desktop lyrics on or off' },
  { id: 'glow', words: ['glow', 'edge'], label: 'Edge glow on or off' },
  { id: 'fullscreen', words: ['fullscreen', 'full'], label: 'Full-screen view' },
  { id: 'mini', words: ['mini'], label: 'Mini player on or off' },
  { id: 'device', words: ['device', 'devices', 'speaker'], label: 'Play on another device' },
  { id: 'player', words: ['player', 'open', 'show'], label: 'Open the player' }
]

/** "1:30", "90", "1m30s", "2m" → milliseconds, or null. */
export function parseTime(s) {
  const t = String(s ?? '')
    .trim()
    .toLowerCase()
  let m = t.match(/^(\d{1,3}):([0-5]?\d)$/)
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 1000
  m = t.match(/^(?:(\d{1,3})m)?\s*(?:(\d{1,4})s?)?$/)
  if (m && (m[1] || m[2])) return (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 1000
  return null
}

/** "40", "40%" → 40 (0 to 100), or null. */
export function parseVolume(s) {
  const m = String(s ?? '')
    .trim()
    .match(/^(\d{1,3})%?$/)
  if (!m) return null
  const v = Number(m[1])
  return v <= 100 ? v : null
}

const byWord = new Map(COMMANDS.flatMap((c) => c.words.map((w) => [w, c])))

/**
 * What a typed line means: { command?, arg?, invalid?, query, queue, suggestions }.
 * command: the one command the line names (with arg, its parsed value).
 * query: text to search for (empty when the line is just a command).
 * queue: the search adds to the queue rather than playing.
 * suggestions: commands the line could be the start of.
 */
export function parseCommand(text) {
  const raw = String(text ?? '').trim()
  const lower = raw.toLowerCase()
  const out = { query: '', queue: false, suggestions: [] }
  if (!raw) return { ...out, suggestions: COMMANDS }
  const [first, ...rest] = raw.split(/\s+/)
  const word = first.toLowerCase()
  const tail = rest.join(' ')
  if ((word === 'queue' || word === 'add') && tail) return { ...out, query: tail, queue: true }
  if (word === 'play' && tail) return { ...out, query: tail }
  const cmd = byWord.get(word)
  if (cmd && (!tail || cmd.arg)) {
    if (cmd.id === 'volume') {
      const v = parseVolume(tail)
      return { ...out, command: cmd, arg: v, invalid: v === null }
    }
    if (cmd.id === 'seek') {
      const v = parseTime(tail)
      return { ...out, command: cmd, arg: v, invalid: v === null }
    }
    return { ...out, command: cmd }
  }
  // the start of a command word (no space yet) suggests it; the line is searched as well
  const suggestions = rest.length
    ? []
    : COMMANDS.filter((c) => c.words.some((w) => w.startsWith(lower)))
  return { ...out, query: raw, suggestions }
}

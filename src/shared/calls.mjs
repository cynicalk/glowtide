// Quieter during calls: which apps are using the microphone right now (as Windows records it
// for its privacy settings), whether one of them is a call, and which processes play the
// music. Pure: the registry is read in main/calls.js.

/**
 * Apps using the mic now, from `reg query <ConsentStore\microphone> /s /v LastUsedTimeStop`.
 * Windows keeps LastUsedTimeStop at 0 while an app has the mic open. Returns their ids: an
 * exe path with '#' for '\' (desktop apps) or a package name (Store apps).
 */
export function parseMicUsers(output) {
  const out = []
  let key = null
  for (const line of String(output || '').split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) key = line.trim()
    else if (key && /^\s+LastUsedTimeStop\s+REG_QWORD\s+0x0\s*$/i.test(line)) {
      const id = key.split('\\').pop()
      if (id && !/^(NonPackaged|microphone)$/i.test(id)) out.push(id)
    }
  }
  return out
}

/** "C:#Users#me#AppData#Local#Discord#app-1#Discord.exe" -> "discord"; packages by name. */
export function exeOf(id) {
  const base = String(id).split('#').pop()
  return base.replace(/\.exe$/i, '').toLowerCase()
}

// Apps you take calls in: the desktop apps, Store packages and browsers (Meet, web calls).
const CALL_EXES = new Set([
  'discord',
  'discordptb',
  'discordcanary',
  'ms-teams',
  'teams',
  'zoom',
  'skype',
  'slack',
  'whatsapp',
  'telegram',
  'signal',
  'webex',
  'ciscocollabhost',
  'webexmta',
  'ringcentral',
  'chrome',
  'msedge',
  'brave',
  'firefox',
  'opera',
  'vivaldi',
  'arc'
])
const CALL_PACKAGES = /(MSTeams|Teams|WhatsApp|Skype|Zoom|Telegram|Discord|Signal|Messenger)/i

export function isCallApp(id) {
  if (String(id).includes('#')) return CALL_EXES.has(exeOf(id))
  return CALL_PACKAGES.test(String(id))
}

/** The mic users that count: call apps only, or any app ('any'). ignore: process names
 * (lower case, no .exe) that never count, such as Glowtide's own voice listening. */
export function callers(users, mode = 'calls', ignore = []) {
  const skip = new Set(ignore.map((n) => String(n).toLowerCase()))
  return users.filter((id) => !skip.has(exeOf(id)) && (mode === 'any' ? true : isCallApp(id)))
}

// The processes behind the apps Glowtide follows, by their label (media.mjs appLabel).
const PROCESSES = {
  Spotify: ['spotify'],
  Chrome: ['chrome'],
  Edge: ['msedge'],
  'Microsoft Edge': ['msedge'],
  Brave: ['brave'],
  Firefox: ['firefox'],
  Opera: ['opera'],
  Vivaldi: ['vivaldi'],
  'Apple Music': ['applemusic', 'amplibraryagent'],
  iTunes: ['itunes'],
  TIDAL: ['tidal'],
  Deezer: ['deezer'],
  'Amazon Music': ['amazon music'],
  foobar2000: ['foobar2000'],
  MusicBee: ['musicbee'],
  VLC: ['vlc'],
  AIMP: ['aimp'],
  Winamp: ['winamp'],
  'Windows Media Player': ['microsoft.media.player', 'wmplayer'],
  'Media Player': ['microsoft.media.player', 'wmplayer']
}

/** Process names (lower case, no .exe) for the app being followed, or [] when unknown. */
export function musicProcesses(label, appId = '') {
  if (PROCESSES[label]) return PROCESSES[label]
  const exe = String(appId).match(/([\w .-]+)\.exe$/i)
  return exe ? [exe[1].toLowerCase()] : []
}

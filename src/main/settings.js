import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { mergeSettings } from '../shared/settingsMerge.mjs'
import { migrateSettings } from '../shared/migrate.mjs'
import { DEFAULT_SHORTCUTS } from '../shared/shortcuts.mjs'

export const DEFAULT_SETTINGS = {
  source: null, // 'system' | 'spotify' | 'youtube' | 'demo' | null (not chosen yet)
  systemApp: 'auto', // which app's media session "Any app" follows
  clientId: '', // Spotify
  googleClientId: '',
  googleClientSecret: '', // a Google "desktop app" secret is not confidential by design
  colour: {
    source: 'album', // 'album' | 'custom'
    glow: 0, // swatch index for each part
    lyrics: 1,
    highlight: 2,
    secondary: 1,
    brightness: 0,
    saturation: 0,
    glow2: 2, // the second colour of a two-colour glow
    custom: '#5fb4ff', // "Override album colour": the glow's first colour
    custom2: '#ff5fa2', // and its second
    fade: true,
    lyricsOwn: false, // the lyrics in your own colours instead of the cover's
    sung: '#ffffff', // the word or line being sung
    unsung: '#b9b2bb', // the rest of the words
    next: '#ffd166' // the highlight (the next word's block, the karaoke sweep)
  },
  glow: {
    enabled: true,
    gradient: 2, // 1 | 2 colours round the edge
    split: 60, // a two-colour glow: the first colour's share of the edge, in percent
    animation: 'music', // 'default' | 'music' | 'idle' | 'none' (see shared/glow.mjs)
    thickness: 4,
    spread: 40,
    intensity: 70,
    displays: 'all', // 'all' | 'primary' | a display id
    taskbar: true, // keep the glow clear of the taskbar (it follows the work area's edge)
    idle: 'steady', // 'steady' | 'off' when nothing plays
    timeOfDay: false, // warmer and dimmer in the evening and at night
    lyrics: false // a flash as each lyric line starts, the chorus a little brighter
  },
  lyrics: {
    overlay: true,
    style: 'stack', // 'stack' | 'constellation'
    size: 100,
    backdrop: 'dim', // 'none' | 'dim' | 'cover' (blurred album art) | 'flow' (flowing colours)
    spacing: 100, // space between lines, in percent
    dim: 35, // backdrop strength
    showClock: true,
    context: false, // show the previous and next line around the current one
    clockFont: 'sans', // 'sans' | 'serif'
    estimated: 'lines', // line-timed songs: 'lines' (exact) | 'words' (guessed within lines)
    timingCheck: true, // listen to the first minute of a song to see if its lyrics run early or late
    font: 'Segoe UI Variable Display',
    display: 'primary' // 'primary' | a display id
  },
  awake: false, // keep the screen awake while music plays
  pauseOnUnplug: true, // pause when headphones or earbuds disconnect, so it doesn't play out loud
  hideForFullscreen: true, // the glow and lyrics overlay hide while another app is full screen
  autoUpdate: true, // check GitHub releases and download updates in the background
  startWithWindows: true, // start (in the tray, window closed) when you sign in to Windows
  showInTaskbar: true, // the player has a taskbar button (off: it lives in the tray only)
  hints: true, // a short description when the pointer rests on a button
  reduceMotion: false, // Glowtide's own switch: covers and messages hold still (Windows' is ignored)
  fps: 30, // the glow and lyrics overlay: 30 (lighter) or 60 (smoother)
  shortcuts: DEFAULT_SHORTCUTS, // global shortcuts, Electron accelerators ('' = none)
  // the mini player beside the tray: on or off, and which extra buttons it shows
  mini: { enabled: false, like: false, shuffle: false, repeat: false },
  // behind the player (and the full-screen view, if asked): the blurred cover, flowing
  // colours, or your own picture or video (copied into the settings folder)
  background: { kind: 'cover', opacity: 70, fullscreen: false, file: '', version: 0 },
  tourDone: false, // the first-run tour was seen (or skipped)
  history: true, // keep a listening history on this PC, for the Stats page
  recap: true, // a notification with your week in music, on Sunday evening
  recapLast: '', // the Sunday whose recap was shown ('2026-11-22')
  yearLast: '', // the year whose "year in music" notification was shown ('2026')
  // quieter during calls: the music goes to level% while a call app ('calls') or any app
  // ('any') uses the microphone
  calls: { enabled: false, mode: 'calls', level: 30 },
  remote: { enabled: false }, // the phone remote: a page on your home network
  // speaking to the command bar: wake: listen for "Hey Glowtide" (off unless you turn it on);
  // mic: the microphone's name, or '' to choose one (never Stereo Mix and the like)
  voice: { wake: false, mic: '' },
  widgets: {
    fps: 60,
    accent: '#7c5cff', // the full-screen view's "custom" colour theme
    // backdrop: 'blur' (the cover blurred, with the visualizer) or 'art' (the cover sharp,
    // filling the screen)
    stage: { style: 'ring', theme: 'album', backdrop: 'blur' }
  }
}

const file = () => join(app.getPath('userData'), 'settings.json')

/** Merge a change into settings, keeping only known keys of the right shape. */
export const deepMerge = mergeSettings

let current = null

export function loadSettings() {
  if (current) return current
  try {
    const saved = migrateSettings(JSON.parse(readFileSync(file(), 'utf8')))
    current = deepMerge(DEFAULT_SETTINGS, saved)
  } catch {
    current = structuredClone(DEFAULT_SETTINGS)
  }
  return current
}

export function updateSettings(patch) {
  current = deepMerge(loadSettings(), patch)
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(current, null, 2))
  } catch (e) {
    console.error('settings save failed', e)
  }
  return current
}

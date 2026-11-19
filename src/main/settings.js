import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { mergeSettings } from '../shared/settingsMerge.mjs'
import { migrateSettings } from '../shared/migrate.mjs'

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
    fade: true
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
    idle: 'steady' // 'steady' | 'off' when nothing plays
  },
  lyrics: {
    overlay: true,
    style: 'stack', // 'stack' | 'constellation'
    size: 100,
    backdrop: 'dim', // 'none' | 'dim' | 'cover' (blurred album art)
    dim: 35, // backdrop strength
    showClock: true,
    context: false, // show the previous and next line around the current one
    clockFont: 'sans', // 'sans' | 'serif'
    estimated: 'lines', // line-timed songs: 'lines' (exact) | 'words' (guessed within lines)
    font: 'Segoe UI Variable Display',
    display: 'primary' // 'primary' | a display id
  },
  awake: false, // keep the screen awake while music plays
  hideForFullscreen: true, // the glow and lyrics overlay hide while another app is full screen
  autoUpdate: true, // check GitHub releases and download updates in the background
  showInTaskbar: true, // the player has a taskbar button (off: it lives in the tray only)
  fps: 30, // the glow and lyrics overlay: 30 (lighter) or 60 (smoother)
  widgets: {
    fps: 60,
    accent: '#7c5cff', // the "custom" colour theme's accent (clock and full screen)
    clock: {
      enabled: false,
      placement: 'wallpaper', // 'wallpaper' | 'top' | 'window'
      theme: 'album', // its colours: 'album' | a preset | 'custom'
      bounds: null,
      style: 'digital', // digital | stacked | minimal | analog | words
      font: 'Segoe UI Variable Display',
      h24: false,
      seconds: false,
      date: 'long', // long | short | none
      colour: 'theme', // theme | solid | gradient
      glow: true,
      opacity: 100
    },
    stage: { style: 'ring', theme: 'album' }
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

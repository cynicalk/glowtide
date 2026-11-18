import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { mergeSettings } from '../shared/settingsMerge.mjs'

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
    custom: '#5fb4ff',
    fade: true
  },
  glow: {
    enabled: true,
    thickness: 4,
    spread: 40,
    intensity: 70,
    reactToAudio: true,
    displays: 'all', // 'all' | 'primary'
    idle: 'steady', // 'steady' | 'off' when nothing plays
    motion: 'flow' // 'flow' (light travels around the edge) | 'still'
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
  fps: 30, // the glow and lyrics overlay: 30 (lighter) or 60 (smoother)
  widgets: {
    fps: 60,
    viz: {
      enabled: true,
      placement: 'wallpaper', // 'wallpaper' | 'top' | 'window'
      bounds: null,
      style: 'bars', // bars | mirror | blocks | ring | waveform | aurora
      theme: 'album', // 'album' | a preset | 'custom'
      accent: '#7c5cff',
      density: 48,
      sensitivity: 100,
      glow: true,
      backdrop: 0,
      card: 'compact', // compact | centred | cover | text | none
      artGlow: true,
      opacity: 100
    },
    clock: {
      enabled: false,
      placement: 'wallpaper',
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
    current = deepMerge(DEFAULT_SETTINGS, JSON.parse(readFileSync(file(), 'utf8')))
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

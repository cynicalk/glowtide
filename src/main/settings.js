import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

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
    idle: 'steady' // 'steady' | 'off' when nothing plays
  },
  lyrics: {
    overlay: true,
    size: 100,
    dim: 35,
    showClock: true,
    estimated: 'lines', // line-timed songs: 'lines' (exact) | 'words' (guessed within lines)
    font: 'Segoe UI Variable Display'
  }
}

const file = () => join(app.getPath('userData'), 'settings.json')

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

export function deepMerge(base, patch) {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v
  }
  return out
}

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

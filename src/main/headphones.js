// Pause when headphones come out (Settings → App): while music plays, every two seconds,
// which headphone outputs Windows has connected; when one goes away (unplugged, or earbuds
// disconnected), the music pauses instead of carrying on out loud.
//
// It reads the registry (as Windows' own sound settings do) rather than asking a page for the
// device list: a page's list wakes Chromium's camera service, about 100 MB, for nothing.

import { execFile } from 'child_process'
import {
  DESC_VALUE,
  NAME_VALUE,
  STATE_VALUE,
  activeHeadphones,
  headphonesGone,
  parseRegValues
} from '../shared/devices.mjs'

const KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render'
const POLL_MS = 2000

function query(value) {
  return new Promise((resolve) =>
    execFile(
      'reg',
      ['query', KEY, '/s', '/v', value],
      { windowsHide: true, timeout: 5000, maxBuffer: 1 << 20 },
      (err, out) => resolve(err ? null : parseRegValues(out, value))
    )
  )
}

/** getState(): Glowtide's state; enabled(): the setting; pause(): pause the music. */
export function createHeadphoneWatch({ getState, enabled, pause, read = query, timer = true }) {
  let labels = new Map() // id -> { desc, name }, read once and again when a new output shows up
  let before = null // the headphones connected at the last look, while playing
  let busy = false

  async function poll() {
    if (busy) return
    const st = getState()
    if (!enabled() || !st.playback?.isPlaying || st.source === 'demo') {
      before = null // a change while paused doesn't count when it plays again
      return
    }
    busy = true
    try {
      const states = await read(STATE_VALUE)
      if (!states) return
      if ([...states.keys()].some((id) => !labels.has(id))) {
        const [desc, name] = await Promise.all([read(DESC_VALUE), read(NAME_VALUE)])
        if (desc && name)
          labels = new Map(
            [...states.keys()].map((id) => [id, { desc: desc.get(id), name: name.get(id) }])
          )
      }
      const now = activeHeadphones(states, labels)
      if (before && headphonesGone(before, now) && getState().playback?.isPlaying) pause()
      before = now
    } finally {
      busy = false
    }
  }

  const id = timer ? setInterval(poll, POLL_MS) : null
  id?.unref?.()
  return { poll, stop: () => clearInterval(id) }
}

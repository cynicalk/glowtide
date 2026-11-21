import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DESC_VALUE,
  NAME_VALUE,
  activeHeadphones,
  headphonesGone,
  isHeadphones,
  parseRegValues
} from '../src/shared/devices.mjs'
import { createHeadphoneWatch } from '../src/main/headphones.js'
import { estimateOffset, suggestNudge } from '../src/shared/timing.mjs'

const KEY = String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render`
const SPK = '{5f0744c9-0000-4000-8000-000000000001}'
const FX = '{ad05b6e2-0000-4000-8000-000000000002}'
const BUDS = '{b5351906-0000-4000-8000-000000000003}'
const MON = '{07dffaa1-0000-4000-8000-000000000004}'
// as `reg query ... /s /v DeviceState` prints it (the earbuds connected or not)
const states = (buds) => `
${KEY}\\${SPK}
    DeviceState    REG_DWORD    0x1

${KEY}\\${FX}
    DeviceState    REG_DWORD    0x1

${KEY}\\${BUDS}
    DeviceState    REG_DWORD    ${buds ? '0x1' : '0x8'}

${KEY}\\${MON}
    DeviceState    REG_DWORD    0x20000004

End of search: 4 match(es) found.
`
const props = (value, names) =>
  Object.entries(names)
    .map(([id, v]) => `\n${KEY}\\${id}\\Properties\n    ${value}    REG_SZ    ${v}\n`)
    .join('')
const DESC = props(DESC_VALUE, {
  [SPK]: 'Speakers',
  [FX]: 'Speakers',
  [BUDS]: 'Headphones',
  [MON]: '2 - LS24DG30X'
})
const NAME = props(NAME_VALUE, {
  [SPK]: 'Realtek(R) Audio',
  [FX]: 'FxSound Audio Enhancer',
  [BUDS]: 'Airdopes 311 Pro',
  [MON]: 'AMD High Definition Audio Device'
})

test('outputs and their states, read from what the registry prints', () => {
  const st = parseRegValues(states(true), 'DeviceState')
  assert.equal(st.size, 4)
  assert.equal(st.get(BUDS), '0x1')
  const desc = parseRegValues(DESC, DESC_VALUE)
  assert.equal(desc.get(BUDS), 'Headphones')
  assert.ok(isHeadphones('Headset', 'Mivi Roam 2 Hands-Free'))
  assert.ok(!isHeadphones('Speakers', 'Realtek(R) Audio'))
})

test('earbuds disconnecting are seen, speakers and monitors are not headphones', () => {
  const labels = new Map(
    [SPK, FX, BUDS, MON].map((id) => [
      id,
      {
        desc: parseRegValues(DESC, DESC_VALUE).get(id),
        name: parseRegValues(NAME, NAME_VALUE).get(id)
      }
    ])
  )
  const on = activeHeadphones(parseRegValues(states(true), 'DeviceState'), labels)
  const off = activeHeadphones(parseRegValues(states(false), 'DeviceState'), labels)
  assert.deepEqual([...on], [BUDS])
  assert.equal(headphonesGone(on, off), BUDS)
  assert.equal(headphonesGone(off, on), null, 'connecting them is not a reason to pause')
})

test('the watch pauses once when earbuds disconnect while playing, never in the demo', async () => {
  let buds = true
  const read = async (value) =>
    value === 'DeviceState'
      ? parseRegValues(states(buds), value)
      : parseRegValues(value === DESC_VALUE ? DESC : NAME, value)
  const st = { source: 'system', playback: { isPlaying: true } }
  let paused = 0
  const w = createHeadphoneWatch({
    getState: () => st,
    enabled: () => true,
    pause: () => paused++,
    read,
    timer: false
  })
  await w.poll()
  buds = false
  await w.poll()
  assert.equal(paused, 1)
  await w.poll()
  assert.equal(paused, 1, 'once')
  // in the demo, nothing
  const demo = { source: 'demo', playback: { isPlaying: true } }
  buds = true
  let p2 = 0
  const d = createHeadphoneWatch({
    getState: () => demo,
    enabled: () => true,
    pause: () => p2++,
    read,
    timer: false
  })
  await d.poll()
  buds = false
  await d.poll()
  assert.equal(p2, 0)
})

// A pretend song: an onset rises at each line start shifted by `late` ms, over steady noise.
function song({ late = 0, lines = 14, noise = 0.6, seed = 3 } = {}) {
  let r = seed
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647
  const starts = Array.from({ length: lines }, (_, i) => 6000 + i * 3700 + Math.round(rnd() * 600))
  const samples = []
  for (let t = 0; t < starts.at(-1) + 6000; t += 33) {
    let v = 0.4 + noise * rnd()
    for (const s of starts) if (Math.abs(t - (s + late)) < 40) v += 6
    samples.push({ t, v })
  }
  return { samples, starts }
}

test('lyrics running late against the singing are found, to within a step', () => {
  // the voice comes in 700 ms after each line's time: the file is 700 ms early, and the
  // nudge that fixes it shows lines 700 ms later, which is -700 in Glowtide's sense
  const { samples, starts } = song({ late: 700 })
  const e = estimateOffset(samples, starts)
  assert.ok(Math.abs(e.offsetMs - -700) <= 50, JSON.stringify(e))
  assert.ok(e.confidence > 3.2)
  assert.equal(suggestNudge(e, 0), e.offsetMs)
  assert.equal(suggestNudge(e, -650), null, 'already nudged about right')
})

test('lyrics on time: nothing to suggest', () => {
  const { samples, starts } = song({ late: 0 })
  const e = estimateOffset(samples, starts)
  assert.ok(Math.abs(e.offsetMs) <= 50)
  assert.equal(suggestNudge(e, 0), null)
})

test('no clear answer from noise, and too few lines is no answer at all', () => {
  const { samples, starts } = song({ late: 0 })
  const flat = samples.map((s, i) => ({ t: s.t, v: 0.5 + ((i * 7919) % 13) / 13 }))
  assert.equal(suggestNudge(estimateOffset(flat, starts), 0), null)
  const short = song({ lines: 5 })
  assert.equal(estimateOffset(short.samples, short.starts), null)
})

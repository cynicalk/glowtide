// Pause when headphones come out: which audio outputs are headphones, and whether one that
// was connected went away. Windows lists every output (and whether it's connected) under
// MMDevices\Audio\Render in the registry; main/headphones.js reads it. Pure.

// What Windows calls headphones and earbuds (the output's description or its name).
const HEADPHONES =
  /head(phone|set)s?|ear(bud|phone)s?|\bbuds\b|airpods|airdopes|hands-?free|\bwh-|\bwf-|galaxy buds|jabra|\bbose\b/i

export const STATE_VALUE = 'DeviceState'
export const DESC_VALUE = '{a45c254e-df1c-4efd-8020-67d146a850e0},2' // "Headphones", "Speakers"
export const NAME_VALUE = '{b3f8fa53-0004-438e-9003-51a46e139bfc},6' // "Airdopes 311 Pro"

/**
 * One value of every output, from `reg query <Render> /s /v <value>`: Map(output id ->
 * value as text). The id is the output's {guid}.
 */
export function parseRegValues(output, value) {
  const out = new Map()
  let id = null
  for (const line of String(output || '').split(/\r?\n/)) {
    const key = line.match(/\\Render\\(\{[0-9a-f-]{36}\})(\\Properties)?\s*$/i)
    if (key) {
      id = key[1].toLowerCase()
      continue
    }
    if (!id) continue
    const m = line.match(/^\s+(\S.*?)\s{4}(REG_\w+)\s{4}(.*)$/)
    if (m && m[1] === value) out.set(id, m[3].trim())
  }
  return out
}

/** Connected: Windows' DEVICE_STATE_ACTIVE (1) in the low bits. */
export const isActive = (state) => (parseInt(state, 16) & 0xf) === 1

/** Whether an output is headphones or earbuds, by its description and name. */
export function isHeadphones(desc, name) {
  return HEADPHONES.test(desc || '') || HEADPHONES.test(name || '')
}

/**
 * The connected headphone outputs: a Set of ids.
 * states: Map(id -> DeviceState text); labels: Map(id -> { desc, name }).
 */
export function activeHeadphones(states, labels) {
  const out = new Set()
  for (const [id, st] of states) {
    const l = labels.get(id)
    if (l && isActive(st) && isHeadphones(l.desc, l.name)) out.add(id)
  }
  return out
}

/** The id of headphones that were connected and aren't any more, or null. */
export function headphonesGone(before, after) {
  for (const id of before) if (!after.has(id)) return id
  return null
}

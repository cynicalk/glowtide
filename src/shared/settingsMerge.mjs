// Merging a settings change (from a window, or settings.json on disk) into the settings.

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const isPrimitive = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
const isNumbers = (v) => isObj(v) && Object.values(v).every((n) => typeof n === 'number')

/**
 * base with patch merged in, keeping only what base already has. Dropped: a key Glowtide
 * doesn't know, a key that would reach an object's prototype, and a value of the wrong
 * shape (an object where a setting is a plain value, or the other way round). A setting
 * that defaults to null (the music source, a widget's saved position) takes a plain value
 * or an object of numbers. Strings are capped, so a setting can't grow without bound.
 */
export function mergeSettings(base, patch) {
  const out = { ...base }
  if (!isObj(patch)) return out
  for (const [k, v] of Object.entries(patch)) {
    if (UNSAFE.has(k) || !Object.hasOwn(base, k)) continue
    const was = base[k]
    if (isObj(was)) {
      if (isObj(v)) out[k] = mergeSettings(was, v)
    } else if (isPrimitive(v)) out[k] = typeof v === 'string' ? v.slice(0, 2000) : v
    else if ((was === null || isNumbers(was)) && isNumbers(v)) out[k] = { ...v }
  }
  return out
}

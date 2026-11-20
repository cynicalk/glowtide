import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand, parseTime, parseVolume, COMMANDS } from '../src/shared/commands.mjs'
import { shareText } from '../src/shared/share.mjs'
import {
  acceleratorFrom,
  validAccelerator,
  prettyAccelerator,
  DEFAULT_SHORTCUTS
} from '../src/shared/shortcuts.mjs'

test('commands by any of their words', () => {
  assert.equal(parseCommand('next').command.id, 'next')
  assert.equal(parseCommand('Skip').command.id, 'next')
  assert.equal(parseCommand('  pause ').command.id, 'pause')
  assert.equal(parseCommand('play').command.id, 'play')
})

test('a value with the command', () => {
  assert.deepEqual(
    [
      parseCommand('volume 40').arg,
      parseCommand('vol 100%').arg,
      parseCommand('volume 140').invalid
    ],
    [40, 100, true]
  )
  assert.equal(parseCommand('seek 1:30').arg, 90000)
  assert.equal(parseCommand('seek nonsense').invalid, true)
})

test('play and queue with words after them search', () => {
  assert.deepEqual(
    [parseCommand('play blinding lights').query, parseCommand('play blinding lights').queue],
    ['blinding lights', false]
  )
  assert.deepEqual(
    [parseCommand('queue levitating').query, parseCommand('queue levitating').queue],
    ['levitating', true]
  )
  const free = parseCommand('the weeknd')
  assert.equal(free.command, undefined)
  assert.equal(free.query, 'the weeknd')
})

test('the start of a word suggests commands, and is searched too', () => {
  const p = parseCommand('sh')
  assert.deepEqual(
    p.suggestions.map((c) => c.id),
    ['shuffle', 'share', 'player']
  )
  assert.equal(p.query, 'sh')
  assert.equal(parseCommand('').suggestions.length, COMMANDS.length)
  assert.deepEqual(parseCommand('sh x').suggestions, [])
})

test('times and volumes', () => {
  assert.equal(parseTime('2:05'), 125000)
  assert.equal(parseTime('90'), 90000)
  assert.equal(parseTime('1m30s'), 90000)
  assert.equal(parseTime('2m'), 120000)
  assert.equal(parseTime('1:75'), null)
  assert.equal(parseTime(''), null)
  assert.equal(parseVolume('0'), 0)
  assert.equal(parseVolume('101'), null)
})

test('share: the song, with a link where the source has one', () => {
  assert.deepEqual(
    shareText({ id: '4cOdK2wGLETKBW3PvgPWqT', name: 'Song', artists: 'A, B' }, 'spotify'),
    {
      text: 'Song — A, B\nhttps://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
    }
  )
  assert.equal(
    shareText({ id: 'yt:dQw4w9WgXcQ', name: 'Song', artists: 'A' }, 'youtube').url,
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ'
  )
  assert.deepEqual(shareText({ id: 'sys|x', name: 'Song', artists: '' }, 'system'), {
    text: 'Song',
    url: null
  })
  assert.equal(shareText(null), null)
})

test('shortcuts: key presses become accelerators', () => {
  const k = (key, code, mods = {}) => acceleratorFrom({ key, code, ...mods })
  assert.equal(k('k', 'KeyK', { ctrlKey: true, altKey: true }), 'CommandOrControl+Alt+K')
  assert.equal(k(' ', 'Space', { ctrlKey: true, altKey: true }), 'CommandOrControl+Alt+Space')
  assert.equal(k('ArrowRight', 'ArrowRight', { altKey: true }), 'Alt+Right')
  assert.equal(k('!', 'Digit1', { shiftKey: true, altKey: true }), 'Alt+Shift+1')
  assert.equal(k('Control', 'ControlLeft', { ctrlKey: true }), null)
})

test('shortcuts: only safe ones are accepted', () => {
  for (const ok of ['CommandOrControl+Alt+L', 'Alt+Right', 'F9', 'MediaPlayPause', 'Super+Shift+N'])
    assert.equal(validAccelerator(ok), true, ok)
  for (const bad of ['K', 'Shift+K', 'Alt+Alt+K', 'Hyper+K', 'Ctrl+K', '', null, 'Alt+'])
    assert.equal(validAccelerator(bad), false, String(bad))
  for (const def of Object.values(DEFAULT_SHORTCUTS)) assert.ok(!def || validAccelerator(def))
  assert.equal(prettyAccelerator('CommandOrControl+Super+X'), 'Ctrl+Win+X')
})

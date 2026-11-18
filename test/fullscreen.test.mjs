import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFullscreenLine } from '../src/shared/fullscreen.mjs'

test('a full-screen report gives the display it fills', () => {
  assert.deepEqual(parseFullscreenLine('{"full":true,"x":-1920,"y":0,"w":1920,"h":1080}'), {
    x: -1920,
    y: 0,
    width: 1920,
    height: 1080
  })
})

test('nothing full screen is null', () => {
  assert.equal(parseFullscreenLine('{"full":false}'), null)
})

test('anything else is ignored rather than read as "nothing full screen"', () => {
  for (const line of [
    '',
    'garbage',
    '{}',
    '{"full":true}',
    '{"full":true,"x":0,"y":0,"w":0,"h":9}'
  ])
    assert.equal(parseFullscreenLine(line), undefined, line)
})

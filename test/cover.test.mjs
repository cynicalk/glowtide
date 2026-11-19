import { test } from 'node:test'
import assert from 'node:assert/strict'
import { largerCover } from '../src/shared/cover.mjs'

test('Spotify album art: the 1500 px version of the same image', () => {
  const id = 'baf89eb11ec7c657805d2da0'
  assert.equal(
    largerCover(`https://i.scdn.co/image/ab67616d0000b273${id}`),
    `https://i.scdn.co/image/ab67616d000082c1${id}`
  )
  assert.equal(
    largerCover(`https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02${id}`),
    `https://image-cdn-ak.spotifycdn.com/image/ab67616d000082c1${id}`
  )
})

test('YouTube stills: the full-size one', () => {
  assert.equal(
    largerCover('https://i.ytimg.com/vi/abc_D-12/mqdefault.jpg'),
    'https://i.ytimg.com/vi/abc_D-12/maxresdefault.jpg'
  )
})

test('anything else is left as it is', () => {
  for (const u of [
    null,
    '',
    'data:image/png;base64,AAAA',
    'https://i.scdn.co/image/ab6765630000ba8a1234', // a podcast: no larger size known
    'https://i.ytimg.com/vi/abc/maxresdefault.jpg',
    'https://evil.example/image/ab67616d0000b273abcd'
  ])
    assert.equal(largerCover(u), null, String(u))
})

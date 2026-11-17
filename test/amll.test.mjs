import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAmllIndex, findAmll, normTitle, splitArtists } from '../src/shared/amll.mjs'

const row = (file, md) =>
  JSON.stringify({ rawLyricFile: file, metadata: Object.entries(md).map(([k, v]) => [k, v]) })

const INDEX = [
  row('1700000000000-1-a.ttml', {
    musicName: ['Paper Lanterns'],
    artists: ['Glass Harbour'],
    spotifyId: ['SPOT1']
  }),
  row('1800000000000-1-b.ttml', {
    musicName: ['Paper Lanterns'],
    artists: ['Glass Harbour'],
    spotifyId: ['SPOT1']
  }),
  row('1750000000000-2-c.ttml', { musicName: ['Stay'], artists: ['Band One'] }),
  row('1750000000001-2-d.ttml', { musicName: ['Stay'], artists: ['Band Two', 'Guest'] }),
  row('1750000000002-3-e.ttml', { musicName: ['Café Noir (Explicit)'], artists: ['Señor & Co'] }),
  'not json',
  ''
].join('\n')

test('normalising titles and artists', () => {
  assert.equal(normTitle('Paper Lanterns - Remastered 2011'), 'paperlanterns')
  assert.equal(normTitle('Paper Lanterns (feat. Someone)'), 'paperlanterns')
  assert.equal(normTitle('Café Noir (Explicit)'), 'cafenoir')
  assert.deepEqual(splitArtists('A, B & C feat. D'), ['a', 'b', 'c', 'd'])
})

test('index builds and skips junk lines', () => {
  const idx = buildAmllIndex(INDEX)
  assert.equal(idx.size, 5)
})

test('Spotify id is an exact match, newest submission wins', () => {
  const idx = buildAmllIndex(INDEX)
  assert.deepEqual(findAmll(idx, { name: 'whatever' }, { spotifyId: 'SPOT1' }), {
    file: '1800000000000-1-b.ttml',
    by: 'id'
  })
})

test('title match needs a shared artist', () => {
  const idx = buildAmllIndex(INDEX)
  assert.equal(findAmll(idx, { name: 'Stay', artists: 'Band Two' }).file, '1750000000001-2-d.ttml')
  assert.equal(findAmll(idx, { name: 'Stay', artists: 'Somebody Else' }), null)
  assert.equal(findAmll(idx, { name: 'Stay', artists: '' }), null)
})

test('title match survives packaging, accents and featured artists', () => {
  const idx = buildAmllIndex(INDEX)
  assert.equal(
    findAmll(idx, { name: 'Paper Lanterns - 2011 Remaster', artists: 'Glass Harbour, Guest' }).file,
    '1800000000000-1-b.ttml'
  )
  assert.equal(
    findAmll(idx, { name: 'Cafe Noir', artists: 'Senor & Co' }).file,
    '1750000000002-3-e.ttml'
  )
})

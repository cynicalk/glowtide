import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { meetsTarget, hexBytes, publishBody } from '../src/shared/lrclib.mjs'

test('the target comparison: byte by byte, most significant first', () => {
  const t = hexBytes('00ff00')
  assert.equal(meetsTarget(hexBytes('00fe99'), t), true)
  assert.equal(meetsTarget(hexBytes('00ff00'), t), true, 'equal counts')
  assert.equal(meetsTarget(hexBytes('00ff01'), t), false)
  assert.equal(meetsTarget(hexBytes('0100'), t), false, 'lengths differ')
  assert.equal(hexBytes('xyz'), null)
})

test('solving an easy challenge the way LRCLIB checks it', () => {
  const prefix = 'TestPrefix123'
  const target = hexBytes('0fff' + 'f'.repeat(60)) // about 1 in 16 hashes qualifies
  let nonce = 0
  const sha = (n) => createHash('sha256').update(`${prefix}${n}`).digest()
  while (!meetsTarget(sha(nonce), target)) nonce++
  assert.ok(sha(nonce)[0] <= 0x0f)
  for (let n = 0; n < nonce; n++) assert.equal(meetsTarget(sha(n), target), false)
})

test('what is published: title, first artist, album, seconds, plain and line-timed lyrics', () => {
  const body = publishBody(
    { name: 'Song', artists: 'Main, Guest', album: 'Album', durationMs: 201600 },
    [
      { t: 1000, text: 'first  line' },
      { t: 61500, text: 'second' },
      { t: 70000, text: '' }
    ]
  )
  assert.deepEqual(body, {
    trackName: 'Song',
    artistName: 'Main',
    albumName: 'Album',
    duration: 202,
    plainLyrics: 'first line\nsecond',
    syncedLyrics: '[00:01.00]first line\n[01:01.50]second'
  })
})

test('nothing is published without a title, an artist, an album and a length', () => {
  const lines = [{ t: 1000, text: 'x' }]
  assert.equal(publishBody({ name: 'S', artists: 'A', durationMs: 1000 }, lines), null)
  assert.equal(publishBody({ name: 'S', album: 'B', durationMs: 1000 }, lines), null)
  assert.equal(publishBody({ name: 'S', artists: 'A', album: 'B', durationMs: 0 }, lines), null)
  assert.equal(publishBody({ name: 'S', artists: 'A', album: 'B', durationMs: 1000 }, []), null)
})

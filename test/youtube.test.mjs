import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseYouTubeTitle,
  parseYouTubeLink,
  isoDurationMs,
  cleanSongTitle
} from '../src/shared/youtube.mjs'

test('Topic channel: the channel is the artist', () => {
  assert.deepEqual(parseYouTubeTitle('Some Song', 'Some Artist - Topic'), {
    artist: 'Some Artist',
    title: 'Some Song'
  })
})

test('"Artist - Title (Official Video)" splits and cleans', () => {
  assert.deepEqual(parseYouTubeTitle('Band Name - Track (Official Music Video)', 'BandVEVO'), {
    artist: 'Band Name',
    title: 'Track'
  })
  assert.deepEqual(parseYouTubeTitle('A – B [Lyric Video]', 'x'), { artist: 'A', title: 'B' })
})

test('no dash: channel name, VEVO suffix removed and words split', () => {
  assert.deepEqual(parseYouTubeTitle('Track (Audio)', 'BandNameVEVO'), {
    artist: 'Band Name',
    title: 'Track'
  })
})

test('feat. credits and pipe tails are dropped for lookup', () => {
  assert.equal(cleanSongTitle('Song (feat. Someone) | Live at X'), 'Song')
  assert.equal(cleanSongTitle('Song ft. Someone Else'), 'Song')
  assert.equal(cleanSongTitle('Song (2011 Remaster)'), 'Song')
  assert.equal(cleanSongTitle('Song (Official Video) (4K Remaster)'), 'Song')
  assert.equal(cleanSongTitle('Song [Official Music Video] [HD]'), 'Song')
})

test('meaningful brackets survive cleaning', () => {
  assert.equal(cleanSongTitle('Song (Acoustic)'), 'Song (Acoustic)')
  assert.equal(cleanSongTitle('Song (Live at Wembley)'), 'Song (Live at Wembley)')
  assert.equal(cleanSongTitle('Song (Remix)'), 'Song (Remix)')
})

test('links: watch, music, short, shorts, playlist, bare ids', () => {
  assert.deepEqual(parseYouTubeLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), {
    videoId: 'dQw4w9WgXcQ'
  })
  assert.deepEqual(
    parseYouTubeLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123'),
    {
      playlistId: 'PLabc123',
      videoId: 'dQw4w9WgXcQ'
    }
  )
  assert.deepEqual(parseYouTubeLink('youtu.be/dQw4w9WgXcQ?t=10'), { videoId: 'dQw4w9WgXcQ' })
  assert.deepEqual(parseYouTubeLink('https://youtube.com/shorts/dQw4w9WgXcQ'), {
    videoId: 'dQw4w9WgXcQ'
  })
  assert.deepEqual(parseYouTubeLink('https://music.youtube.com/playlist?list=OLAK5uy_abcDEF'), {
    playlistId: 'OLAK5uy_abcDEF'
  })
  assert.deepEqual(parseYouTubeLink('dQw4w9WgXcQ'), { videoId: 'dQw4w9WgXcQ' })
  assert.deepEqual(parseYouTubeLink('PLxyz123'), { playlistId: 'PLxyz123' })
})

test('links: other sites and junk are rejected', () => {
  assert.equal(parseYouTubeLink('https://example.com/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(parseYouTubeLink('not a link'), null)
  assert.equal(parseYouTubeLink(''), null)
})

test('ISO durations', () => {
  assert.equal(isoDurationMs('PT3M21S'), 201000)
  assert.equal(isoDurationMs('PT1H2M'), 3720000)
  assert.equal(isoDurationMs('P0D'), 0)
  assert.equal(isoDurationMs(undefined), 0)
})

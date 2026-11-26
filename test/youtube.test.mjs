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

test('film titles: "Song - Film | Cast | Singers" is read as the song, by its singers', () => {
  // Kesariya showed as a song called "Brahmāstra" by "Kesariya"
  assert.deepEqual(
    parseYouTubeTitle(
      'Kesariya - Brahmāstra | Ranbir Kapoor | Alia Bhatt | Pritam | Arijit Singh | Amitabh',
      'Sony Music India'
    ),
    { artist: 'Pritam, Arijit Singh, Amitabh', title: 'Kesariya' }
  )
  assert.deepEqual(
    parseYouTubeTitle(
      'Kesariya - Official Lyric|Brahmāstra|Ranbir, Alia |Pritam, Arijit Singh, Amitabh',
      'Sony Music India'
    ),
    { artist: 'Pritam, Arijit Singh, Amitabh', title: 'Kesariya' }
  )
  assert.deepEqual(
    parseYouTubeTitle('Aashiqui 2: Tum Hi Ho 8K Full Song | Aditya Roy Kapur | Arijit', 'T-Series'),
    { artist: 'Aditya Roy Kapur, Arijit', title: 'Tum Hi Ho' }
  )
  assert.deepEqual(
    parseYouTubeTitle('Tum Hi Ho (Lyrics)|Arijit Singh|Aashiqui 2|@tseries', 'T-Series'),
    {
      artist: 'Arijit Singh',
      title: 'Tum Hi Ho'
    }
  )
  // the singer first
  assert.deepEqual(
    parseYouTubeTitle(
      'Arijit Singh - Apna Bana Le | Varun Dhawan, Kriti Sanon | Sachin-Jigar, Arijit Singh',
      'Zee Music Company'
    ),
    { artist: 'Arijit Singh', title: 'Apna Bana Le' }
  )
  assert.deepEqual(
    parseYouTubeTitle(
      'Arijit Singh - Apna Bana Le | Varun Dhawan, Kriti Sanon | Sachin-Jigar | Love Song',
      'Soulful Arijit Singh Songs'
    ),
    { artist: 'Arijit Singh', title: 'Apna Bana Le' }
  )
  // the film's name before the song, and "(Lyrical Video)"
  assert.equal(
    parseYouTubeTitle(
      'Jawan: Chaleya (Lyrical Video) | Shah Rukh Khan | Anirudh | Arijit',
      'T-Series'
    ).title,
    'Chaleya'
  )
  // the show's name first
  assert.deepEqual(
    parseYouTubeTitle(
      'Coke Studio | Season 14 | Pasoori | Ali Sethi, Shae Gill',
      'Coke Studio Pakistan'
    ),
    { artist: 'Ali Sethi, Shae Gill', title: 'Pasoori' }
  )
  // "Song - Official Video": the song first, the channel the artist
  assert.deepEqual(parseYouTubeTitle('Apna Bana Le - Official Video', 'Sachin-Jigar'), {
    artist: 'Sachin-Jigar',
    title: 'Apna Bana Le'
  })
})

test('"Artist - Song" stays as it was, and the channel decides which side is the artist', () => {
  // packaging after a pipe doesn't make it a film title
  assert.deepEqual(
    parseYouTubeTitle('The Weeknd - Blinding Lights | Official Video', 'TheWeekndVEVO'),
    {
      artist: 'The Weeknd',
      title: 'Blinding Lights'
    }
  )
  assert.deepEqual(parseYouTubeTitle('Coldplay - Yellow | Lyrics', 'Lyric Vibes'), {
    artist: 'Coldplay',
    title: 'Yellow'
  })
  // the channel is the left side: Artist - Song, even with names after a pipe
  assert.deepEqual(parseYouTubeTitle("Drake - God's Plan | Scorpion", 'DrakeVEVO'), {
    artist: 'Drake',
    title: "God's Plan"
  })
  // the channel is the right side: Song - Artist
  assert.deepEqual(parseYouTubeTitle('Blinding Lights - The Weeknd', 'The Weeknd'), {
    artist: 'The Weeknd',
    title: 'Blinding Lights'
  })
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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMusicSearch, searchBody, SONGS_FILTER } from '../src/shared/innertube.mjs'
import { searchMusic } from '../src/main/innertube.js'

// the shape of a YouTube Music search answer (made up, but laid out as the real one is)
const col = (...texts) => ({
  musicResponsiveListItemFlexColumnRenderer: { text: { runs: texts.map((text) => ({ text })) } }
})
const song = (videoId, title, ...second) => ({
  musicResponsiveListItemRenderer: {
    playlistItemData: videoId ? { videoId } : undefined,
    flexColumns: [col(title), col(...second)]
  }
})
const answer = (items) => ({
  contents: {
    tabbedSearchResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: items } }] }
            }
          }
        }
      ]
    }
  }
})

test('songs are read from a YouTube Music search answer', () => {
  const songs = parseMusicSearch(
    answer([
      song('AAAAAAAAAA1', 'First Song', 'Some Artist', ' • ', 'Some Album', ' • ', '4:29'),
      song('BBBBBBBBBB2', 'Second Song', 'Another Artist', ' • ', '3:05'),
      song('CCCCCCCCCC3', 'A Long Mix', 'Someone', ' • ', 'An Album', ' • ', '1:02:03')
    ])
  )
  assert.equal(songs.length, 3)
  assert.deepEqual(
    {
      videoId: songs[0].videoId,
      name: songs[0].name,
      artists: songs[0].artists,
      album: songs[0].album,
      durationMs: songs[0].durationMs,
      id: songs[0].id
    },
    {
      videoId: 'AAAAAAAAAA1',
      name: 'First Song',
      artists: 'Some Artist',
      album: 'Some Album',
      durationMs: 269000,
      id: 'yt:AAAAAAAAAA1'
    }
  )
  assert.equal(songs[1].album, '')
  assert.equal(songs[1].durationMs, 185000)
  assert.equal(songs[2].durationMs, 3723000)
  // pictures from YouTube's own image host only
  assert.ok(songs.every((s) => s.thumb.startsWith('https://i.ytimg.com/vi/')))
})

test('anything that is not a proper song is left out', () => {
  const songs = parseMusicSearch(
    answer([
      song(null, 'No id'),
      song('short', 'Bad id'),
      song('../../etc/x', 'Path in the id'),
      song('DDDDDDDDDD4', ''),
      { somethingElse: {} },
      song('EEEEEEEEEE5', 'Fine', 'Artist')
    ])
  )
  assert.deepEqual(
    songs.map((s) => s.videoId),
    ['EEEEEEEEEE5']
  )
  assert.deepEqual(parseMusicSearch(null), [])
  assert.deepEqual(parseMusicSearch({}), [])
  assert.deepEqual(parseMusicSearch({ contents: 'nonsense' }), [])
})

test('the search asks for songs, and a query is capped', () => {
  const b = searchBody('x'.repeat(500), '1.2')
  assert.equal(b.query.length, 200)
  assert.equal(b.context.client.clientName, 'WEB_REMIX')
  assert.equal(b.params, decodeURIComponent(SONGS_FILTER))
})

test('the search goes to one address and reports trouble plainly', async () => {
  let asked = null
  const ok = await searchMusic('song', {
    fetcher: async (url, opts) => {
      asked = { url, opts }
      return {
        ok: true,
        text: async () => JSON.stringify(answer([song('FFFFFFFFFF6', 'Hit', 'Band')]))
      }
    }
  })
  assert.equal(ok[0].videoId, 'FFFFFFFFFF6')
  assert.match(asked.url, /^https:\/\/music\.youtube\.com\/youtubei\/v1\/search\?/)
  assert.equal(asked.opts.redirect, 'error')
  assert.deepEqual(await searchMusic('  '), [])
  await assert.rejects(
    searchMusic('x', { fetcher: async () => ({ ok: false, status: 403 }) }),
    /didn't answer the search \(403\)/
  )
  await assert.rejects(
    searchMusic('x', { fetcher: async () => ({ ok: true, text: async () => '<html>' }) }),
    /couldn't be read/
  )
  await assert.rejects(
    searchMusic('x', {
      fetcher: async () => {
        throw new Error('offline')
      }
    }),
    /Couldn't reach YouTube Music/
  )
})

test('YouTube video search: songs from videos, no live streams or long mixes', async () => {
  const { parseVideoSearch } = await import('../src/shared/innertube.mjs')
  const { parseYouTubeTitle } = await import('../src/shared/youtube.mjs')
  const v = (videoId, title, channel, length) => ({
    videoRenderer: {
      videoId,
      title: { runs: [{ text: title }] },
      ownerText: { runs: [{ text: channel }] },
      lengthText: length ? { simpleText: length } : undefined
    }
  })
  const json = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    v(
                      'AAAAAAAAAA1',
                      'Some Artist - First Song (Official Video)',
                      'SomeArtistVEVO',
                      '3:30'
                    ),
                    v('BBBBBBBBBB2', 'A live stream', 'Radio', null),
                    v('CCCCCCCCCC3', '10 hour mix', 'Mixes', '10:00:00'),
                    v('bad', 'Bad id', 'X', '3:00')
                  ]
                }
              }
            ]
          }
        }
      }
    }
  }
  const songs = parseVideoSearch(json, parseYouTubeTitle)
  assert.deepEqual(
    songs.map((s) => s.videoId),
    ['AAAAAAAAAA1']
  )
  assert.equal(songs[0].durationMs, 210000)
  assert.equal(songs[0].name, 'First Song')
  assert.equal(songs[0].artist, 'Some Artist')
})

test('another upload of a song that will not play', async () => {
  const { pickAnotherUpload } = await import('../src/shared/innertube.mjs')
  const r = (videoId, rawTitle, durationMs = 240000) => ({
    videoId,
    rawTitle,
    name: rawTitle,
    durationMs
  })
  const results = [
    r('AAAAAAAAAA1', 'Kesariya - Brahmastra | Official Video'), // the one that failed
    r('BBBBBBBBBB2', 'Kesariya - Live at the stadium'),
    r('CCCCCCCCCC3', 'Some other song entirely'),
    r('DDDDDDDDDD4', 'Kesariya - Brahmastra (Official Video)', 600000), // far too long
    r('EEEEEEEEEE5', 'Kesariya - Brahmastra | Official Lyric Video'),
    r('FFFFFFFFFF6', 'Kesariya Brahmastra Arijit Singh')
  ]
  // the lyric upload first; not the one tried, the live one, another song, or a long one
  const first = pickAnotherUpload(results, {
    name: 'Kesariya',
    durationMs: 240000,
    tried: ['AAAAAAAAAA1']
  })
  assert.equal(first?.videoId, 'EEEEEEEEEE5')
  const second = pickAnotherUpload(results, {
    name: 'Kesariya',
    durationMs: 240000,
    tried: ['AAAAAAAAAA1', 'EEEEEEEEEE5']
  })
  assert.equal(second?.videoId, 'FFFFFFFFFF6')
  assert.equal(pickAnotherUpload(results, { name: 'Unrelated title', tried: [] }), null)
  assert.equal(pickAnotherUpload([], { name: 'Kesariya' }), null)
  // a live song may take a live upload
  const live = pickAnotherUpload([r('BBBBBBBBBB2', 'Kesariya - Live at the stadium')], {
    name: 'Kesariya (Live)'
  })
  assert.equal(live?.videoId, 'BBBBBBBBBB2')
})

// ---------- albums, playlists and their songs ----------

const listItem = ({ name, second, play, browse, thumbs = [] }) => ({
  musicResponsiveListItemRenderer: {
    flexColumns: [col(name), col(...second)],
    navigationEndpoint: browse ? { browseEndpoint: { browseId: browse } } : undefined,
    overlay: play
      ? {
          musicItemThumbnailOverlayRenderer: {
            content: {
              musicPlayButtonRenderer: {
                playNavigationEndpoint: { watchPlaylistEndpoint: { playlistId: play } }
              }
            }
          }
        }
      : undefined,
    thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: thumbs } } }
  }
})

test('album and playlist search answers', async () => {
  const { parseListSearch, listSearchBody, ALBUMS_FILTER, PLAYLISTS_FILTER } =
    await import('../src/shared/innertube.mjs')
  assert.equal(listSearchBody('x', '1', 'album').params, ALBUMS_FILTER)
  assert.equal(listSearchBody('x', '1', 'playlist').params, PLAYLISTS_FILTER)
  const albums = parseListSearch(
    answer([
      listItem({
        name: 'Kiss Land',
        second: ['Album', ' • ', 'The Weeknd', ' • ', '2013'],
        play: 'OLAK5uy_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        browse: 'MPREb_abc',
        thumbs: [
          { url: 'https://yt3.googleusercontent.com/a=w60', width: 60 },
          { url: 'https://yt3.googleusercontent.com/a=w120', width: 120 },
          { url: 'https://yt3.googleusercontent.com/a=w544', width: 544 }
        ]
      }),
      // no way to play it: left out
      listItem({ name: 'Broken', second: ['Album', ' • ', 'Nobody'], browse: 'MPREb_x' }),
      // a picture from anywhere else isn't kept
      listItem({
        name: 'Trilogy',
        second: ['Album', ' • ', 'The Weeknd', ' • ', '2012'],
        play: 'OLAK5uy_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        thumbs: [{ url: 'https://evil.example/x.jpg', width: 120 }]
      })
    ]),
    'album'
  )
  assert.equal(albums.length, 2)
  assert.deepEqual(albums[0], {
    id: 'OLAK5uy_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    playlistId: 'OLAK5uy_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    kind: 'album',
    name: 'Kiss Land',
    by: 'The Weeknd',
    year: '2013',
    thumb: 'https://yt3.googleusercontent.com/a=w120'
  })
  assert.equal(albums[1].thumb, null)

  // a playlist found by its page (VL + its id) when there's no play button
  const lists = parseListSearch(
    answer([
      listItem({ name: 'Best Of', second: ['Felipe', ' • ', '5.2M views'], browse: 'VLPLabc123' })
    ]),
    'playlist'
  )
  assert.equal(lists[0].playlistId, 'PLabc123')
  assert.equal(lists[0].by, 'Felipe')
  assert.equal(lists[0].year, '')
  assert.deepEqual(parseListSearch({}, 'album'), [])
})

test("a playlist's songs from the watch page's list", async () => {
  const { parsePlaylistSongs } = await import('../src/shared/innertube.mjs')
  const { parseYouTubeTitle } = await import('../src/shared/youtube.mjs')
  const v = (videoId, title, by, length) => ({
    playlistPanelVideoRenderer: {
      videoId,
      title: { simpleText: title },
      longBylineText: { runs: [{ text: by }] },
      lengthText: length ? { simpleText: length } : undefined
    }
  })
  const json = {
    contents: {
      twoColumnWatchNextResults: {
        playlist: {
          playlist: {
            title: 'Album - Kiss Land',
            totalVideos: 4,
            contents: [
              v('tcLr-GIJQfI', 'Professional', 'The Weeknd', '6:09'),
              v('XXXXXXXXXX2', '[Private video]', '', null), // no length: left out
              v('bad', 'Not an id', 'x', '1:00'),
              v('YYYYYYYYYY3', 'The Weeknd - Kiss Land (Official Audio)', 'The Weeknd', '7:35')
            ]
          }
        }
      }
    }
  }
  const d = parsePlaylistSongs(json, parseYouTubeTitle)
  assert.equal(d.name, 'Album - Kiss Land')
  assert.equal(d.total, 4)
  assert.deepEqual(
    d.items.map((s) => [s.videoId, s.name, s.artist, s.durationMs]),
    [
      ['tcLr-GIJQfI', 'Professional', 'The Weeknd', 369000],
      ['YYYYYYYYYY3', 'Kiss Land', 'The Weeknd', 455000]
    ]
  )
  assert.deepEqual(parsePlaylistSongs({}, parseYouTubeTitle), { name: '', total: 0, items: [] })
})

test('what the window hands over to keep is checked', async () => {
  const { cleanSong, cleanList } = await import('../src/shared/innertube.mjs')
  const s = cleanSong({
    videoId: 'tcLr-GIJQfI',
    name: 'Professional',
    artists: 'The Weeknd',
    durationMs: 369000,
    cover: 'https://evil.example/x.jpg', // never kept: covers come from the id
    extra: 'dropped'
  })
  assert.equal(s.cover, 'https://i.ytimg.com/vi/tcLr-GIJQfI/mqdefault.jpg')
  assert.equal(s.extra, undefined)
  assert.equal(s.artist, 'The Weeknd')
  assert.equal(cleanSong('yt:tcLr-GIJQfI').videoId, 'tcLr-GIJQfI')
  assert.equal(cleanSong({ videoId: 'nope' }), null)
  assert.equal(cleanSong({ videoId: 'tcLr-GIJQfI', name: 'x'.repeat(1000) }).name.length, 300)
  assert.equal(cleanSong({ videoId: 'tcLr-GIJQfI', durationMs: 'a lot' }).durationMs, 0)

  const p = cleanList({
    id: 'PLabc123',
    name: 'Mine',
    kind: 'weird',
    thumb: 'javascript:alert(1)',
    count: 3
  })
  assert.deepEqual(p, {
    id: 'PLabc123',
    playlistId: 'PLabc123',
    kind: 'playlist',
    name: 'Mine',
    by: '',
    year: '',
    thumb: null,
    count: 3
  })
  assert.equal(cleanList({ id: 'has spaces' }), null)
  assert.equal(cleanList({ id: '../../etc' }), null)
})

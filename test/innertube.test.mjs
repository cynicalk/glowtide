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

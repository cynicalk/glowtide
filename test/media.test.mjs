import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appLabel, isBrowser, systemTrack, repeatFromSmtc } from '../src/shared/media.mjs'
import { parseYouTubeTitle } from '../src/shared/youtube.mjs'

test('app labels', () => {
  assert.equal(appLabel('Spotify.exe'), 'Spotify')
  assert.equal(appLabel('Chrome'), 'Chrome')
  assert.equal(appLabel('MSEdge'), 'Edge')
  assert.equal(appLabel('308046B0AF4A39CB'), 'Firefox')
  assert.equal(appLabel('AppleInc.AppleMusicWin_nzyj5cx40ttqa!App'), 'Apple Music')
  assert.equal(appLabel('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), 'Media Player')
  assert.equal(appLabel('Contoso.CoolPlayer_abc123!App'), 'CoolPlayer')
  assert.equal(appLabel('C:\\Program Files\\Some Player\\someplayer.exe'), 'someplayer')
  assert.equal(appLabel(null), 'Unknown app')
})

test('browsers are recognised', () => {
  assert.ok(isBrowser('Chrome'))
  assert.ok(isBrowser('308046B0AF4A39CB'))
  assert.ok(!isBrowser('Spotify.exe'))
})

test('Spotify metadata is used as-is', () => {
  const t = systemTrack({
    app: 'Spotify.exe',
    title: 'Song - Remastered 2011',
    artist: 'Band',
    album: 'Album',
    durationMs: 200000
  })
  assert.equal(t.name, 'Song - Remastered 2011')
  assert.equal(t.artist, 'Band')
  assert.equal(t.album, 'Album')
  assert.equal(t.durationMs, 200000)
})

test('youtube.com in a browser: title parsed into artist and song', () => {
  const t = systemTrack({
    app: 'Chrome',
    title: 'Band Name - Track (Official Video)',
    artist: 'BandNameVEVO',
    album: ''
  })
  assert.equal(t.artist, 'Band Name')
  assert.equal(t.name, 'Track')
})

test('YouTube Music in a browser (has an album) is left alone', () => {
  const t = systemTrack({ app: 'MSEdge', title: 'Track', artist: 'Artist', album: 'Album' })
  assert.equal(t.name, 'Track')
  assert.equal(t.artist, 'Artist')
})

test('the same song gives the same id; another song does not', () => {
  const a = systemTrack({ app: 'Spotify.exe', title: 'A', artist: 'X', durationMs: 1 })
  const b = systemTrack({ app: 'Spotify.exe', title: 'A', artist: 'X', durationMs: 2 })
  const c = systemTrack({ app: 'Spotify.exe', title: 'B', artist: 'X' })
  assert.equal(a.id, b.id)
  assert.notEqual(a.id, c.id)
})

test('repeat modes', () => {
  assert.equal(repeatFromSmtc('None'), 'off')
  assert.equal(repeatFromSmtc('Track'), 'track')
  assert.equal(repeatFromSmtc('List'), 'context')
  assert.equal(repeatFromSmtc(''), 'off')
})

test('channel names are not split at capitals unless they are VEVO channels', () => {
  assert.equal(parseYouTubeTitle('Song', 'McFly').artist, 'McFly')
  assert.equal(parseYouTubeTitle('Song', 'BandNameVEVO').artist, 'Band Name')
})

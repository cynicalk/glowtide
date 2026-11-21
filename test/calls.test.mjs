import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callers, exeOf, isCallApp, musicProcesses, parseMicUsers } from '../src/shared/calls.mjs'

const REG = String.raw`
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\5319275A.WhatsAppDesktop_cv1g1gvanyjgm
    LastUsedTimeStop    REG_QWORD    0x1dc5a1b2c3d4e5f

HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\MSTeams_8wekyb3d8bbwe
    LastUsedTimeStop    REG_QWORD    0x0

HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged
    LastUsedTimeStop    REG_QWORD    0x0

HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged\C:#Users#me#AppData#Local#Discord#app-1.0.9219#Discord.exe
    LastUsedTimeStop    REG_QWORD    0x0

HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged\C:#Riot Games#VALORANT#live#VALORANT-Win64-Shipping.exe
    LastUsedTimeStop    REG_QWORD    0x0

End of search: 5 match(es) found.
`

test('the apps using the mic right now, from the registry', () => {
  assert.deepEqual(parseMicUsers(REG), [
    'MSTeams_8wekyb3d8bbwe',
    'C:#Users#me#AppData#Local#Discord#app-1.0.9219#Discord.exe',
    'C:#Riot Games#VALORANT#live#VALORANT-Win64-Shipping.exe'
  ])
  assert.deepEqual(parseMicUsers(''), [])
})

test('calls are call apps; a game with voice chat counts only with "any app"', () => {
  const users = parseMicUsers(REG)
  assert.equal(exeOf(users[1]), 'discord')
  assert.ok(isCallApp(users[0]) && isCallApp(users[1]))
  assert.ok(!isCallApp(users[2]))
  assert.equal(callers(users).length, 2)
  assert.equal(callers(users, 'any').length, 3)
  assert.ok(isCallApp('C:#Program Files#Google#Chrome#Application#chrome.exe'), 'Meet in a browser')
})

test('the processes that play the followed app', () => {
  assert.deepEqual(musicProcesses('Spotify', 'Spotify.exe'), ['spotify'])
  assert.deepEqual(musicProcesses('Edge', 'MSEdge'), ['msedge'])
  assert.deepEqual(musicProcesses('Strange Player', 'Strange.exe'), ['strange'])
  assert.deepEqual(musicProcesses('Something', 'Pkg.Thing_abc!App'), [])
})

// The ducker with a pretend registry and pretend controls (no PowerShell, nothing audible).
async function ducker({ source = 'youtube', volume = 70, mic = [], file } = {}) {
  const { createCallDucker } = await import('../src/main/calls.js')
  const { mkdtempSync, writeFileSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')
  const dir = mkdtempSync(join(tmpdir(), 'glowtide-calls-'))
  if (file) writeFileSync(join(dir, 'call-duck.json'), JSON.stringify(file))
  const sent = []
  const st = { source, playback: { isPlaying: true, volume }, systemApp: null }
  const users = { now: mic }
  const d = createCallDucker({
    dir,
    getState: () => st,
    settings: () => ({ calls: { enabled: true, mode: 'calls', level: 30 } }),
    control: async (a, v) => {
      sent.push(v === undefined ? a : `${a} ${v}`)
      return { ok: true }
    },
    readMic: async () => users.now,
    timer: false
  })
  return { d, sent, st, users }
}
const DISCORD = 'C:#Users#me#AppData#Local#Discord#app-1#Discord.exe'

test('a call turns the music down and back up after it ends', async () => {
  const { d, sent, users } = await ducker({ source: 'spotify', volume: 70, mic: [DISCORD] })
  await d.poll()
  assert.deepEqual(sent, ['volume 21'], 'to 30% of 70')
  await d.poll()
  assert.equal(sent.length, 1, 'once per call')
  users.now = []
  await d.poll()
  assert.equal(sent.length, 1, 'a moment of silence on the call is not the end of it')
  await d.poll()
  assert.deepEqual(sent, ['volume 21', 'volume 70'])
})

test('a game with voice chat is not a call unless asked', async () => {
  const { d, sent } = await ducker({ mic: ['C:#Games#VALORANT-Win64-Shipping.exe'] })
  await d.poll()
  assert.deepEqual(sent, [])
})

test('when nothing can be turned down, it is not tried again all call long', async () => {
  const { d, sent } = await ducker({ source: 'spotify', volume: null, mic: [DISCORD] })
  await d.poll()
  await d.poll()
  assert.deepEqual(sent, [])
  assert.equal(d.ducked.method, 'none')
})

test('what a crash left down is put back, through the same source only', async () => {
  const left = { method: 'youtube', source: 'youtube' }
  const a = await ducker({ source: 'youtube', file: left })
  await a.d.poll()
  await a.d.poll()
  assert.deepEqual(a.sent, ['volume 100'])
  const b = await ducker({ source: 'spotify', file: left })
  await b.d.poll()
  await b.d.poll()
  assert.deepEqual(b.sent, [], 'not sent to Spotify')
})

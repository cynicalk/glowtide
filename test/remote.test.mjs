import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { request } from 'http'
import { checkControl, createRemote, REMOTE_PORT } from '../src/main/remote.js'

// A raw request, so the Host and Origin headers can be anything a browser or attacker sends.
function call(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: REMOTE_PORT,
        path,
        method,
        headers: { host: `127.0.0.1:${REMOTE_PORT}`, ...headers }
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          try {
            json = JSON.parse(text)
          } catch {
            /* not json */
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json })
        })
      }
    )
    req.on('error', reject)
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}
const post = (path, body, headers = {}) =>
  call(path, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } })

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'glowtide-remote-'))
  const sent = []
  const state = {
    source: 'spotify',
    track: { id: 't1', name: 'Song', artist: 'Band', durationMs: 200000, cover: null },
    playback: { isPlaying: true, progressMs: 1000, at: Date.now(), volume: 60 },
    lyricsStatus: 'synced',
    caps: {}
  }
  const remote = createRemote({
    dir,
    getState: () => state,
    getLyrics: () => [{ t: 0, text: 'hello' }],
    control: async (action, arg) => {
      sent.push([action, arg])
      return { ok: true }
    }
  })
  return { dir, sent, state, remote }
}
const started = (remote) =>
  new Promise((resolve) => {
    remote.start('127.0.0.1')
    const wait = () => (remote.status().running ? resolve() : setTimeout(wait, 20))
    wait()
  })

test('the remote checks every control value before it reaches the music', () => {
  assert.deepEqual(checkControl('seek', 1234.6), { action: 'seek', arg: 1235 })
  assert.equal(checkControl('seek', -1), undefined)
  assert.equal(checkControl('seek', '1000'), undefined)
  assert.equal(checkControl('volume', 101), undefined)
  assert.equal(checkControl('repeat', 'forever'), undefined)
  assert.equal(checkControl('shuffle', 'yes'), undefined)
  assert.equal(checkControl('playItems', {}), undefined, 'only what the remote page uses')
  assert.deepEqual(checkControl('pause'), { action: 'pause' })
})

test('pairing, tokens and the doors that stay shut', async () => {
  const { dir, sent, remote } = setup()
  await started(remote)
  try {
    // the page loads, under a strict CSP
    const page = await call('/')
    assert.equal(page.status, 200)
    assert.match(page.headers['content-security-policy'], /script-src 'self'/)

    // a domain rebound to this PC (DNS rebinding) is refused
    assert.equal((await call('/', { headers: { host: 'evil.example:43822' } })).status, 421)
    // another site's page can't post to it
    assert.equal(
      (await post('/api/pair', { code: '000000' }, { origin: 'http://evil.example' })).status,
      403
    )
    // nothing without a token
    assert.equal((await call('/api/state')).status, 401)
    assert.equal((await post('/api/control', { action: 'pause' })).status, 401)
    assert.equal(
      (await call('/api/state', { headers: { 'x-glowtide-token': 'x'.repeat(43) } })).status,
      401
    )

    // no code asked for in Glowtide: pairing is closed
    assert.equal((await post('/api/pair', { code: '123456' })).status, 403)

    // five wrong guesses end the code
    const { code } = remote.pair()
    const wrong = code === '000001' ? '000002' : '000001'
    for (let i = 0; i < 5; i++) assert.equal((await post('/api/pair', { code: wrong })).status, 403)
    assert.equal((await post('/api/pair', { code })).status, 403, 'the right code is dead now')

    // a fresh code pairs once, and only once
    const fresh = remote.pair()
    const ok = await post('/api/pair', { code: fresh.code, name: 'Phone<script>' })
    assert.equal(ok.status, 200)
    assert.ok(ok.json.token.length >= 40)
    assert.equal((await post('/api/pair', { code: fresh.code })).status, 403, 'single use')
    const saved = readFileSync(join(dir, 'remote-phones.json'), 'utf8')
    assert.ok(!saved.includes(ok.json.token), 'only a hash of the token is stored')
    assert.ok(!saved.includes('<script>'))

    const auth = { 'x-glowtide-token': ok.json.token }
    const st = await call('/api/state', { headers: auth })
    assert.equal(st.status, 200)
    assert.equal(st.json.track.title, 'Song')
    assert.equal((await call('/api/lyrics', { headers: auth })).json.lines[0].text, 'hello')

    // controls: good ones pass, bad ones stop at the door
    assert.equal((await post('/api/control', { action: 'volume', arg: 30 }, auth)).status, 200)
    assert.equal((await post('/api/control', { action: 'volume', arg: 300 }, auth)).status, 400)
    assert.equal((await post('/api/control', { action: 'playItems', arg: {} }, auth)).status, 400)
    assert.equal((await post('/api/control', '{not json', auth)).status, 400)
    assert.equal((await post('/api/control', 'x'.repeat(10000), auth)).status, 400, 'capped body')
    assert.deepEqual(sent, [['volume', 30]])

    // forgetting phones revokes the token
    remote.forget()
    assert.equal((await call('/api/state', { headers: auth })).status, 401)
  } finally {
    remote.stop()
  }
})

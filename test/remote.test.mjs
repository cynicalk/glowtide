import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { request } from 'http'
import { createHash, createHmac, randomBytes } from 'crypto'
import {
  checkControl,
  createRemote,
  fetchAllowed,
  privateAddress,
  REMOTE_PORT,
  signature
} from '../src/main/remote.js'
import { REMOTE_CRYPTO_JS } from '../src/main/remoteCrypto.js'

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

// stand-ins for DPAPI: what's on disk isn't the key as it is
const protect = (k) => `enc:${Buffer.from(k).toString('hex')}`
const unprotect = (v) => Buffer.from(String(v).slice(4), 'hex').toString()

function setup(dir = mkdtempSync(join(tmpdir(), 'glowtide-remote-'))) {
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
    protect,
    unprotect,
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

// What a paired phone sends: "<id>.<time>.<signature>" over method, path, time and body.
const signed = (phone, method, path, body = '', ts = Date.now()) => ({
  'x-glowtide-auth': `${phone.id}.${ts}.${signature(phone.key, method, path, String(ts), body)}`
})
const pairPhone = async (remote) => {
  const { code } = remote.pair()
  const ok = await post('/api/pair', { code })
  return { id: ok.json.id, key: ok.json.key }
}

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

test('pairing, signed requests and the doors that stay shut', async () => {
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
    // nothing unsigned, and nothing signed by a made-up phone
    assert.equal((await call('/api/state')).status, 401)
    assert.equal((await post('/api/control', { action: 'pause' })).status, 401)
    const madeUp = { 'x-glowtide-auth': `${'a'.repeat(32)}.${Date.now()}.${'x'.repeat(43)}` }
    assert.equal((await call('/api/state', { headers: madeUp })).status, 401)

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
    const phone = { id: ok.json.id, key: ok.json.key }
    assert.match(phone.id, /^[0-9a-f]{32}$/)
    assert.equal(Buffer.from(phone.key, 'base64url').length, 32)
    assert.equal((await post('/api/pair', { code: fresh.code })).status, 403, 'single use')
    const saved = readFileSync(join(dir, 'remote-phones.json'), 'utf8')
    assert.ok(!saved.includes(phone.key), 'the key is kept protected, not as it is')
    assert.ok(!saved.includes('<script>'))

    // signed requests work; the key itself is never sent
    const st = await call('/api/state', { headers: signed(phone, 'GET', '/api/state') })
    assert.equal(st.status, 200)
    assert.equal(st.json.track.title, 'Song')
    assert.ok(Number(st.headers['x-glowtide-time']) > 0, 'the phone keeps to the PC clock')
    const ly = await call('/api/lyrics', { headers: signed(phone, 'GET', '/api/lyrics') })
    assert.equal(ly.json.lines[0].text, 'hello')

    // a signature read off the Wi-Fi can't be used again, for that request or another
    const once = signed(phone, 'GET', '/api/state')
    assert.equal((await call('/api/state', { headers: once })).status, 200)
    assert.equal((await call('/api/state', { headers: once })).status, 401, 'replayed')
    assert.equal((await call('/api/lyrics', { headers: once })).status, 401, 'other path')
    // an old one is refused, and so is the right key under another phone's id
    const old = signed(phone, 'GET', '/api/state', '', Date.now() - 5 * 60000)
    assert.equal((await call('/api/state', { headers: old })).status, 401, 'too old')
    const other = { id: 'b'.repeat(32), key: phone.key }
    assert.equal(
      (await call('/api/state', { headers: signed(other, 'GET', '/api/state') })).status,
      401
    )

    // controls: the body is signed too; good ones pass, bad ones stop at the door
    const ctl = (body) => {
      const raw = typeof body === 'string' ? body : JSON.stringify(body)
      return post('/api/control', raw, signed(phone, 'POST', '/api/control', raw))
    }
    assert.equal((await ctl({ action: 'volume', arg: 30 })).status, 200)
    assert.equal((await ctl({ action: 'volume', arg: 300 })).status, 400)
    assert.equal((await ctl({ action: 'playItems', arg: {} })).status, 400)
    assert.equal((await ctl('{not json')).status, 400)
    assert.equal((await ctl('x'.repeat(10000))).status, 400, 'capped body')
    // a body changed on the way (signed for pause, sent as next) is refused
    const sig = signed(phone, 'POST', '/api/control', JSON.stringify({ action: 'pause' }))
    assert.equal((await post('/api/control', JSON.stringify({ action: 'next' }), sig)).status, 401)
    assert.deepEqual(sent, [['volume', 30]])

    // forgetting phones revokes the key
    remote.forget()
    assert.equal(
      (await call('/api/state', { headers: signed(phone, 'GET', '/api/state') })).status,
      401
    )
  } finally {
    remote.stop()
  }
})

test('a paired phone survives a restart, its key read back from disk', async () => {
  const a = setup()
  await started(a.remote)
  let phone
  try {
    phone = await pairPhone(a.remote)
  } finally {
    a.remote.stop()
  }
  const b = setup(a.dir)
  await started(b.remote)
  try {
    const r = await call('/api/state', { headers: signed(phone, 'GET', '/api/state') })
    assert.equal(r.status, 200)
  } finally {
    b.remote.stop()
  }
})

test('the phone page signs exactly as the PC checks (its own SHA-256 and HMAC)', () => {
  const c = new Function(`${REMOTE_CRYPTO_JS}; return { sha256, hmacSha256, signRequest }`)()
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 1000]) {
    const data = randomBytes(n)
    assert.equal(
      Buffer.from(c.sha256(new Uint8Array(data))).toString('hex'),
      createHash('sha256').update(data).digest('hex'),
      `sha256 of ${n} bytes`
    )
    const key = randomBytes(n % 100)
    assert.equal(
      Buffer.from(c.hmacSha256(new Uint8Array(key), new Uint8Array(data))).toString('hex'),
      createHmac('sha256', key).update(data).digest('hex'),
      `hmac of ${n} bytes with a ${key.length}-byte key`
    )
  }
  const key = randomBytes(32).toString('base64url')
  const body = JSON.stringify({ action: 'seek', arg: 61234, note: 'é ✓' })
  assert.equal(
    c.signRequest(key, 'POST', '/api/control', '1795284597873', body),
    signature(key, 'POST', '/api/control', '1795284597873', body)
  )
})

test('only devices on a private network', () => {
  for (const a of [
    '127.0.0.1',
    '::1',
    '::ffff:192.168.1.20',
    '10.0.4.9',
    '172.16.0.2',
    '172.31.9.9',
    '169.254.3.3',
    'fe80::1',
    'fd12:3456::1'
  ])
    assert.ok(privateAddress(a), a)
  for (const a of ['8.8.8.8', '::ffff:52.1.2.3', '172.32.0.1', '100.64.0.1', '2001:db8::1', ''])
    assert.ok(!privateAddress(a), a)
  assert.ok(!privateAddress(undefined))
})

test('a cover fetch follows redirects only to the picture hosts', async () => {
  const HOSTS = /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|ytimg\.com)\//i
  const reply = (status, location) => ({
    status,
    ok: status < 300,
    headers: new Map(location ? [['location', location]] : [])
  })
  // a redirect to another allowed host is followed
  const hops = []
  const okFetch = async (url) => {
    hops.push(url)
    return url.includes('first') ? reply(302, 'https://i.ytimg.com/vi/x/hq.jpg') : reply(200)
  }
  const r = await fetchAllowed('https://i.scdn.co/first', HOSTS, { fetcher: okFetch })
  assert.equal(r.status, 200)
  assert.deepEqual(hops, ['https://i.scdn.co/first', 'https://i.ytimg.com/vi/x/hq.jpg'])
  // one off the list is not, nor are endless ones, nor a start off the list
  const evil = async () => reply(302, 'http://169.254.169.254/latest/meta-data')
  assert.equal(await fetchAllowed('https://i.scdn.co/a', HOSTS, { fetcher: evil }), null)
  const loop = async () => reply(301, 'https://i.scdn.co/again')
  assert.equal(await fetchAllowed('https://i.scdn.co/a', HOSTS, { fetcher: loop }), null)
  assert.equal(await fetchAllowed('https://example.com/a.jpg', HOSTS, { fetcher: okFetch }), null)
})

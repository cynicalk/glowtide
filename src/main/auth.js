// Spotify sign-in: Authorization Code with PKCE through a loopback redirect.
// No client secret and no backend. Tokens are encrypted with Windows DPAPI
// (Electron safeStorage) before they touch disk.

import { app, shell, safeStorage } from 'electron'
import { createServer } from 'http'
import { randomBytes, createHash } from 'crypto'
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

export const REDIRECT_PORT = 43821
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played'
].join(' ')

const tokenFile = () => join(app.getPath('userData'), 'spotify.token')
const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let tokens = null // { access_token, refresh_token, expires_at }

function save() {
  if (!tokens) return
  const raw = JSON.stringify(tokens)
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(raw)
    : Buffer.from(raw)
  writeFileSync(tokenFile(), data)
}

export function loadTokens() {
  try {
    const buf = readFileSync(tokenFile())
    const raw = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString()
    tokens = JSON.parse(raw)
  } catch {
    tokens = null
  }
  return !!tokens
}

export function isConnected() {
  return !!tokens?.refresh_token
}

export function signOut() {
  tokens = null
  try {
    rmSync(tokenFile(), { force: true })
  } catch {
    /* already gone */
  }
}

async function tokenRequest(clientId, params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...params })
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new Error(body.error_description || body.error || `Token request failed (${res.status})`)
  tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token || tokens?.refresh_token,
    expires_at: Date.now() + (body.expires_in - 60) * 1000
  }
  save()
}

let refreshing = null
export async function getAccessToken(clientId) {
  if (!tokens) throw new Error('Not connected')
  if (Date.now() < tokens.expires_at) return tokens.access_token
  refreshing ??= tokenRequest(clientId, {
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
  }).finally(() => (refreshing = null))
  await refreshing
  return tokens.access_token
}

export function forceExpire() {
  if (tokens) tokens.expires_at = 0
}

let pending = null
/** Open Spotify's sign-in page in the default browser and wait for the redirect. */
export function signIn(clientId) {
  if (!clientId) return Promise.reject(new Error('Add your Spotify Client ID first'))
  pending?.close()
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(12))

  return new Promise((resolve, reject) => {
    const page = (msg) =>
      `<!doctype html><meta charset=utf-8><body style="background:#070608;color:#f3ece6;font:16px 'Segoe UI';display:grid;place-items:center;height:100vh;margin:0"><div>${msg}</div>`
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT_URI)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const err = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const done = (ok, msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(page(msg))
        server.close()
        pending = null
        ok ? resolve() : reject(new Error(msg))
      }
      if (err) return done(false, `Spotify sign-in was cancelled (${err}).`)
      if (url.searchParams.get('state') !== state || !code)
        return done(false, 'Sign-in response did not match. Try again.')
      try {
        await tokenRequest(clientId, {
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier
        })
        done(true, 'Connected. You can close this tab and go back to Glowtide.')
      } catch (e) {
        done(false, e.message)
      }
    })
    server.on('error', (e) =>
      reject(new Error(`Couldn't open port ${REDIRECT_PORT}: ${e.message}`))
    )
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      pending = server
      const q = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        scope: SCOPES,
        state
      })
      shell.openExternal(`https://accounts.spotify.com/authorize?${q}`)
    })
    setTimeout(
      () => {
        if (pending === server) {
          server.close()
          pending = null
          reject(new Error('Sign-in timed out. Try again.'))
        }
      },
      5 * 60 * 1000
    )
  })
}

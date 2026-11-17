// OAuth 2 Authorization Code + PKCE through a loopback redirect, for desktop apps.
// Used for Spotify (no secret) and Google (a "desktop app" client, whose secret is
// not confidential by design). Tokens are encrypted with Windows DPAPI via safeStorage.

import { app, shell, safeStorage } from 'electron'
import { createServer } from 'http'
import { randomBytes, createHash } from 'crypto'
import { readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

export const REDIRECT_PORT = 43821
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let pendingServer = null

/**
 * name: token file name; getClient(): { clientId, clientSecret? }
 */
export function createOAuth({ name, label, authUrl, tokenUrl, scopes, extraAuth = {}, getClient }) {
  const tokenFile = () => join(app.getPath('userData'), `${name}.token`)
  let tokens = null
  let refreshing = null

  function save() {
    const raw = JSON.stringify(tokens)
    writeFileSync(
      tokenFile(),
      safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(raw) : Buffer.from(raw)
    )
  }

  async function tokenRequest(params) {
    const { clientId, clientSecret } = getClient()
    const body = new URLSearchParams({ client_id: clientId, ...params })
    if (clientSecret) body.set('client_secret', clientSecret)
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (data.error === 'invalid_grant' && params.grant_type === 'refresh_token') {
        signOut()
        throw new Error(`${label} sign-in expired. Sign in again.`)
      }
      throw new Error(
        data.error_description || data.error || `Token request failed (${res.status})`
      )
    }
    tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens?.refresh_token,
      expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000
    }
    save()
  }

  function load() {
    try {
      const buf = readFileSync(tokenFile())
      tokens = JSON.parse(
        safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString()
      )
    } catch {
      tokens = null
    }
    return isConnected()
  }

  function isConnected() {
    return !!tokens?.refresh_token
  }

  function signOut() {
    tokens = null
    rmSync(tokenFile(), { force: true })
  }

  async function getAccessToken() {
    if (!tokens) throw new Error(`${label} isn't connected`)
    if (Date.now() < tokens.expires_at) return tokens.access_token
    refreshing ??= tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    }).finally(() => (refreshing = null))
    await refreshing
    return tokens.access_token
  }

  function forceExpire() {
    if (tokens) tokens.expires_at = 0
  }

  /** Open the provider's sign-in page in the default browser and wait for the redirect. */
  function signIn() {
    const { clientId } = getClient()
    if (!clientId) return Promise.reject(new Error(`Add your ${label} Client ID first`))
    pendingServer?.close()
    const verifier = b64url(randomBytes(48))
    const challenge = b64url(createHash('sha256').update(verifier).digest())
    const state = b64url(randomBytes(12))
    const page = (msg) =>
      `<!doctype html><meta charset=utf-8><body style="background:#070608;color:#f3ece6;font:16px 'Segoe UI';display:grid;place-items:center;height:100vh;margin:0"><div>${msg}</div>`

    return new Promise((resolve, reject) => {
      const server = createServer(async (req, res) => {
        const url = new URL(req.url, REDIRECT_URI)
        if (url.pathname !== '/callback') return res.writeHead(404).end()
        const done = (ok, msg) => {
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(page(msg))
          server.close()
          pendingServer = null
          ok ? resolve() : reject(new Error(msg))
        }
        const err = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        if (err) return done(false, `${label} sign-in was cancelled (${err}).`)
        if (url.searchParams.get('state') !== state || !code)
          return done(false, 'Sign-in response did not match. Try again.')
        try {
          await tokenRequest({
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
        pendingServer = server
        const q = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: REDIRECT_URI,
          code_challenge_method: 'S256',
          code_challenge: challenge,
          scope: scopes.join(' '),
          state,
          ...extraAuth
        })
        shell.openExternal(`${authUrl}?${q}`)
      })
      setTimeout(
        () => {
          if (pendingServer === server) {
            server.close()
            pendingServer = null
            reject(new Error('Sign-in timed out. Try again.'))
          }
        },
        5 * 60 * 1000
      )
    })
  }

  return { load, isConnected, signOut, getAccessToken, forceExpire, signIn }
}

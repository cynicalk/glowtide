import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { api } from '../lib/store'

export default function Connect({ state, settings }) {
  const [clientId, setClientId] = useState(settings.clientId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [copied, setCopied] = useState(false)
  const validId = /^[0-9a-f]{32}$/i.test(clientId.trim())

  async function connect() {
    if (!validId) {
      setErr('A Client ID is 32 letters and numbers. Copy it from your Spotify app page.')
      return
    }
    setErr(null)
    setBusy(true)
    await api.setSettings({ clientId: clientId.trim() })
    const r = await api.connect()
    setBusy(false)
    if (r?.error) setErr(r.error)
  }

  return (
    <div className="connect">
      <div className="hero">
        <div className="orb" />
        <h1>Connect Spotify</h1>
        <p>Glowtide controls Spotify on this PC and lights up your screen with the song.</p>
      </div>
      <ol className="steps">
        <li>
          <span>Create an app on the Spotify developer dashboard. Choose “Web API”.</span>
          <button
            className="pill"
            onClick={() => api.open('https://developer.spotify.com/dashboard')}
          >
            <ExternalLink size={13} /> Open dashboard
          </button>
        </li>
        <li>
          <span>Add this redirect URI to the app:</span>
          <div className="copy">
            <code>{state.redirectUri}</code>
            <button
              className="rd sm"
              aria-label="Copy redirect URI"
              onClick={() => {
                navigator.clipboard.writeText(state.redirectUri)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </li>
        <li>
          <span>Paste the app’s Client ID:</span>
          <input
            className="field"
            value={clientId}
            placeholder="0f1e2d3c4b5a69788796a5b4c3d2e1f0"
            spellCheck={false}
            onChange={(e) => {
              setClientId(e.target.value)
              setErr(null)
            }}
          />
        </li>
      </ol>
      {err && <div className="error">{err}</div>}
      <button className="primary" onClick={connect} disabled={busy}>
        {busy ? 'Waiting for Spotify…' : 'Connect Spotify'}
      </button>
      <p className="fine">
        Play, pause and skip need Spotify Premium. Sign-in happens on Spotify’s own page in your
        browser.
      </p>
      <button className="link" onClick={() => api.setDemo(true)}>
        Try the demo first
      </button>
    </div>
  )
}

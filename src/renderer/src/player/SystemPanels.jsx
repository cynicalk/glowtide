import { Check } from 'lucide-react'
import { api } from '../lib/store'

/** Library / search / queue while following another app: those live in that app. */
export function SystemInfo({ state, what }) {
  const app = state.systemApp?.label || 'your music app'
  return (
    <div className="muted pad">
      Glowtide is following {app}. {what} there, and Glowtide picks it up.
    </div>
  )
}

/** Which app to follow: the one Windows calls current, or a specific one. */
export function SystemApps({ state }) {
  const sel = state.systemSelected || 'auto'
  const rows = [{ id: 'auto', label: 'Automatic', sub: 'Whatever Windows says is playing' }].concat(
    state.systemApps.map((a) => ({
      ...a,
      sub: state.systemApp?.id === a.id ? 'Following now' : 'Has a media session'
    }))
  )
  return (
    <>
      <div className="muted pad">
        Apps that show up in Windows’ media controls. Spotify, browsers playing YouTube Music, Apple
        Music, TIDAL and most players do.
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className={`row device ${sel === r.id ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => api.selectSystemApp(r.id)}
        >
          <div className="row-text">
            <div className="t">{r.label}</div>
            <div className="s">{r.sub}</div>
          </div>
          {sel === r.id && <Check size={15} />}
        </div>
      ))}
      {!state.systemApps.length && (
        <div className="muted pad">No apps are playing right now. Start some music anywhere.</div>
      )}
    </>
  )
}

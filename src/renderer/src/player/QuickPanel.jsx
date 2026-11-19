import { Check, Monitor, X } from 'lucide-react'
import { api, useColours, useDisplays, useGlowtide } from '../lib/store'
import { glowAnimation } from '../../../shared/glow.mjs'
import { Toggle, OverrideWheels } from './SettingsPanel'
import { ANIMATION_OPTIONS, GRADIENTS } from './glowOptions'

const UPDATE_TEXT = {
  dev: 'development run',
  checking: 'Checking…',
  downloading: 'Downloading…',
  current: 'Up to date',
  error: 'Couldn’t check'
}

/**
 * The tray's quick settings: click Glowtide's tray icon and this opens beside it, the way the
 * Mac version's menu-bar panel does. The edge glow's everyday choices, the taskbar button,
 * updates, and Open / Quit.
 */
export default function QuickPanel() {
  const { state, settings } = useGlowtide()
  const colours = useColours(state, settings)
  const displays = useDisplays()
  if (!state || !settings || !colours) return <div className="quick" />
  const g = settings.glow
  const c = settings.colour
  const set = (patch) => api.setSettings(patch)
  const setGlow = (patch) => set({ glow: patch })
  const u = state.update || {}
  const status =
    u.status === 'ready'
      ? `${u.version} is ready`
      : u.status === 'downloading' && u.percent != null
        ? `Downloading ${Math.round(u.percent)}%`
        : UPDATE_TEXT[u.status] || ''
  const choices = [
    ['all', 'All displays'],
    ['primary', 'Main display'],
    ...(displays.length > 1 ? displays.map((d) => [d.id, d.label]) : [])
  ]
  return (
    <div className="quick" style={{ '--glow': colours.glow }}>
      <div className="q-head">
        <span>Glowtide</span>
        <Toggle label="Edge glow" on={g.enabled} onChange={(v) => setGlow({ enabled: v })} />
        <button className="rd sm ghost" aria-label="Close" onClick={() => api.closeQuick()}>
          <X size={14} />
        </button>
      </div>

      <label className="q-row">
        <span>Gradient</span>
        <select
          value={g.gradient === 2 ? 2 : 1}
          onChange={(e) => setGlow({ gradient: Number(e.target.value) })}
        >
          {GRADIENTS.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="q-row">
        <span>Animation</span>
        <select value={glowAnimation(g)} onChange={(e) => setGlow({ animation: e.target.value })}>
          {ANIMATION_OPTIONS.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div className="q-row">
        <span>Keep clear of the taskbar</span>
        <Toggle
          label="Keep the glow clear of the taskbar"
          on={!!g.taskbar}
          onChange={(v) => setGlow({ taskbar: v })}
        />
      </div>

      <div className="q-slider">
        <span>Thickness</span>
        <input
          type="range"
          min={1}
          max={16}
          value={g.thickness}
          style={{ '--p': `${((g.thickness - 1) / 15) * 100}%` }}
          onChange={(e) => setGlow({ thickness: Number(e.target.value) })}
        />
      </div>
      <div className="q-slider">
        <span>Glow</span>
        <input
          type="range"
          min={10}
          max={100}
          value={g.intensity}
          style={{ '--p': `${((g.intensity - 10) / 90) * 100}%` }}
          onChange={(e) => setGlow({ intensity: Number(e.target.value) })}
        />
      </div>

      <div className="q-row">
        <span>Override album colour</span>
        <Toggle
          label="Override album colour"
          on={c.source === 'custom'}
          onChange={(v) => set({ colour: { source: v ? 'custom' : 'album' } })}
        />
      </div>
      {c.source === 'custom' && <OverrideWheels c={c} g={g} set={set} />}

      <div className="q-label">Display</div>
      <div className="qlist q-displays">
        {choices.map(([k, text]) => (
          <button
            key={k}
            className={String(g.displays) === String(k) ? 'on' : ''}
            onClick={() => setGlow({ displays: k })}
          >
            <Monitor size={13} /> <span>{text}</span>
            {String(g.displays) === String(k) && <Check size={13} />}
          </button>
        ))}
      </div>

      <hr />
      <div className="q-row">
        <span>Lyrics on the desktop</span>
        <Toggle
          label="Lyrics on the desktop"
          on={settings.lyrics.overlay}
          onChange={(v) => set({ lyrics: { overlay: v } })}
        />
      </div>
      <div className="q-row">
        <span>Show in taskbar</span>
        <Toggle
          label="Show in taskbar"
          on={settings.showInTaskbar !== false}
          onChange={(v) => set({ showInTaskbar: v })}
        />
      </div>

      <hr />
      <div className="q-row">
        <span className="muted">
          Version {u.current || ''}
          {status && ` · ${status}`}
        </span>
        {u.status === 'ready' ? (
          <button className="pill on" onClick={() => api.installUpdate()}>
            Restart to update
          </button>
        ) : (
          u.status !== 'dev' && (
            <button
              className="pill"
              disabled={u.status === 'checking' || u.status === 'downloading'}
              onClick={() => api.checkUpdate()}
            >
              Check for updates
            </button>
          )
        )}
      </div>
      <div className="q-row">
        <span>Check automatically</span>
        <Toggle
          label="Check for updates automatically"
          on={settings.autoUpdate !== false}
          onChange={(v) => set({ autoUpdate: v })}
        />
      </div>

      <hr />
      <div className="q-foot">
        <button className="pill" onClick={() => api.showPlayer()}>
          Open Glowtide
        </button>
        <button className="pill" onClick={() => api.quit()}>
          Quit Glowtide
        </button>
      </div>
    </div>
  )
}

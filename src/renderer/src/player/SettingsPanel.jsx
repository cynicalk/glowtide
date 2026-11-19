import { useState } from 'react'
import {
  AlignCenter,
  Sparkles,
  Sun,
  Waves as WavesIcon,
  Activity,
  Mic2,
  Power,
  MessageCircle
} from 'lucide-react'
import { api, useDisplays } from '../lib/store'
import { DEFAULT_PALETTE, resolveColours } from '../../../shared/colour.mjs'
import { THEMES, vizPalette } from '../../../shared/viz.mjs'
import { glowAnimation } from '../../../shared/glow.mjs'
import ColourWheel from './ColourWheel'
import { ANIMATION_HINTS, ANIMATION_OPTIONS, GRADIENTS } from './glowOptions'

// Fonts that ship with Windows 10/11, so every choice renders.
const FONTS = [
  'Segoe UI Variable Display',
  'Segoe UI Black',
  'Bahnschrift',
  'Arial Black',
  'Trebuchet MS',
  'Georgia',
  'Cambria',
  'Palatino Linotype',
  'Constantia',
  'Consolas',
  'Impact',
  'Ink Free'
]

const STYLES = [
  ['stack', 'Stack', AlignCenter, 'Big word or line in the middle'],
  ['karaoke', 'Karaoke', Mic2, 'Words sweep into colour as they are sung, with a count-in'],
  ['constellation', 'Stars', Sparkles, 'Each verse fills a real constellation'],
  ['aura', 'Aura', Sun, 'Lyrics over a glowing cloud of the cover’s colours'],
  ['waves', 'Waves', WavesIcon, 'The whole line rides a ripple'],
  ['beat', 'Beat', Activity, 'Pulses with the music'],
  ['messages', 'Messages', MessageCircle, 'The lyrics arrive as text messages, with emojis']
]

/**
 * A settings section that folds: click its header to open or close it. Switches and
 * buttons in the header still work without folding. Open/closed is remembered.
 */
function Fold({ k, open: startOpen = false, children }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`fold:${k}`)
      return v == null ? startOpen : v === '1'
    } catch {
      return startOpen
    }
  })
  const click = (e) => {
    if (!e.target.closest('.sh') || e.target.closest('button, input, select, label')) return
    setOpen((o) => {
      try {
        localStorage.setItem(`fold:${k}`, o ? '0' : '1')
      } catch {
        /* remembering is optional */
      }
      return !o
    })
  }
  return (
    <section className={`fold ${open ? 'open' : ''}`} onClick={click}>
      {children}
    </section>
  )
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg small">
      {options.map(([k, label]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, unit = '' }) {
  return (
    <label className="srow">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="val">
        {value > 0 && min < 0 ? '+' : ''}
        {value}
        {unit}
      </span>
    </label>
  )
}

function SwatchPick({ label, palette, value, onChange, disabled }) {
  return (
    <div className={`srow ${disabled ? 'off' : ''}`}>
      <span>{label}</span>
      <div className="swpick">
        {palette.map((c, i) => (
          <button
            key={i}
            aria-label={`${label}: swatch ${i + 1}`}
            className={value === i ? 'on' : ''}
            style={{ background: c }}
            disabled={disabled}
            onClick={() => onChange(i)}
          />
        ))}
      </div>
    </div>
  )
}

export default function SettingsPanel({ state, settings, onClose }) {
  const displays = useDisplays()
  const c = settings.colour
  const g = settings.glow
  const l = settings.lyrics
  const palette = state.palette || DEFAULT_PALETTE
  const resolved = resolveColours(state.palette, c)
  const set = (patch) => api.setSettings(patch)
  const album = c.source === 'album'

  return (
    <div className="settings">
      <Fold k="colours">
        <div className="sh">
          <h3>Colours</h3>
          <div className="seg small">
            <button
              className={album ? 'on' : ''}
              onClick={() => set({ colour: { source: 'album' } })}
            >
              Album art
            </button>
            <button
              className={!album ? 'on' : ''}
              onClick={() => set({ colour: { source: 'custom' } })}
            >
              Override
            </button>
          </div>
        </div>
        <div className="palette">
          {palette.map((h, i) => (
            <span key={i} style={{ background: h }} title={h} />
          ))}
          <em>{state.palette ? 'from this cover' : 'default palette (no cover yet)'}</em>
        </div>
        <SwatchPick
          label="Edge glow"
          palette={palette}
          value={c.glow}
          disabled={!album}
          onChange={(v) => set({ colour: { glow: v } })}
        />
        {g.gradient === 2 && (
          <SwatchPick
            label="Second glow colour"
            palette={palette}
            value={c.glow2 ?? 2}
            disabled={!album}
            onChange={(v) => set({ colour: { glow2: v } })}
          />
        )}
        <SwatchPick
          label="Lyrics"
          palette={palette}
          value={c.lyrics}
          disabled={!album}
          onChange={(v) => set({ colour: { lyrics: v } })}
        />
        <SwatchPick
          label="Highlight"
          palette={palette}
          value={c.highlight}
          disabled={!album}
          onChange={(v) => set({ colour: { highlight: v } })}
        />
        <SwatchPick
          label="Secondary text"
          palette={palette}
          value={c.secondary ?? c.lyrics}
          disabled={!album}
          onChange={(v) => set({ colour: { secondary: v } })}
        />
        {!album && <OverrideWheels c={c} g={g} set={set} />}
        <Slider
          label="Brightness"
          min={-30}
          max={30}
          value={c.brightness}
          onChange={(v) => set({ colour: { brightness: v } })}
        />
        <Slider
          label="Saturation"
          min={-50}
          max={50}
          value={c.saturation}
          onChange={(v) => set({ colour: { saturation: v } })}
        />
        <div className="srow">
          <span>Fade between songs</span>
          <Toggle
            label="Fade between songs"
            on={c.fade}
            onChange={(v) => set({ colour: { fade: v } })}
          />
        </div>
        <div className="result">
          <span style={{ background: resolved.glow }} />
          <span style={{ color: resolved.lyrics }}>Lyrics</span>
          <span
            className="hl"
            style={{ background: resolved.highlight, color: resolved.highlightText }}
          >
            highlight
          </span>
        </div>
        <p className="fine">Dark colours are lifted automatically so lyrics stay readable.</p>
      </Fold>

      <Fold k="glow">
        <div className="sh">
          <h3>Edge glow</h3>
          <Toggle
            label="Edge glow"
            on={g.enabled}
            onChange={(v) => set({ glow: { enabled: v } })}
          />
        </div>
        <div className="srow">
          <span>Gradient</span>
          <Seg
            value={g.gradient === 2 ? 2 : 1}
            options={GRADIENTS}
            onChange={(v) => set({ glow: { gradient: v } })}
          />
        </div>
        {g.gradient === 2 && (
          <Slider
            label="First colour’s share"
            min={20}
            max={80}
            step={5}
            value={g.split ?? 60}
            unit="%"
            onChange={(v) => set({ glow: { split: v } })}
          />
        )}
        <div className="srow">
          <span>Animation</span>
          <Seg
            value={glowAnimation(g)}
            options={ANIMATION_OPTIONS}
            onChange={(v) => set({ glow: { animation: v } })}
          />
        </div>
        <p className="fine">{ANIMATION_HINTS[glowAnimation(g)]}</p>
        <Slider
          label="Thickness"
          min={1}
          max={16}
          value={g.thickness}
          unit="px"
          onChange={(v) => set({ glow: { thickness: v } })}
        />
        <Slider
          label="Spread"
          min={0}
          max={160}
          value={g.spread}
          unit="px"
          onChange={(v) => set({ glow: { spread: v } })}
        />
        <Slider
          label="Intensity"
          min={10}
          max={100}
          value={g.intensity}
          unit="%"
          onChange={(v) => set({ glow: { intensity: v } })}
        />
        <div className="srow">
          <span>Keep clear of the taskbar</span>
          <Toggle
            label="Keep the glow clear of the taskbar"
            on={!!g.taskbar}
            onChange={(v) => set({ glow: { taskbar: v } })}
          />
        </div>
        <p className="fine">The glow runs along the top of the taskbar instead of behind it.</p>
        <label className="srow">
          <span>Display</span>
          <select
            value={String(g.displays)}
            onChange={(e) => {
              const v = e.target.value
              set({ glow: { displays: v === 'all' || v === 'primary' ? v : Number(v) } })
            }}
          >
            <option value="all">All displays</option>
            <option value="primary">Main display</option>
            {displays.length > 1 &&
              displays.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.label}
                </option>
              ))}
          </select>
        </label>
        <div className="srow">
          <span>When paused</span>
          <div className="seg small">
            <button
              className={g.idle === 'steady' ? 'on' : ''}
              onClick={() => set({ glow: { idle: 'steady' } })}
            >
              Soft glow
            </button>
            <button
              className={g.idle === 'off' ? 'on' : ''}
              onClick={() => set({ glow: { idle: 'off' } })}
            >
              Off
            </button>
          </div>
        </div>
      </Fold>

      <Fold k="lyrics">
        <div className="sh">
          <h3>Lyrics overlay</h3>
          <Toggle
            label="Lyrics overlay"
            on={l.overlay}
            onChange={(v) => set({ lyrics: { overlay: v } })}
          />
        </div>
        <div className="styles">
          {STYLES.map(([k, label, Icon, hint]) => (
            <button
              key={k}
              className={`style-tile ${(l.style || 'stack') === k ? 'on' : ''}`}
              title={hint}
              onClick={() => set({ lyrics: { style: k } })}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <Slider
          label="Size"
          min={50}
          max={160}
          value={l.size}
          unit="%"
          onChange={(v) => set({ lyrics: { size: v } })}
        />
        <div className="srow">
          <span>Backdrop</span>
          <Seg
            value={l.backdrop || 'dim'}
            options={[
              ['none', 'None'],
              ['dim', 'Dim'],
              ['cover', 'Album art']
            ]}
            onChange={(v) => set({ lyrics: { backdrop: v } })}
          />
        </div>
        {(l.backdrop || 'dim') !== 'none' && (
          <Slider
            label="Backdrop strength"
            min={5}
            max={100}
            value={l.dim}
            unit="%"
            onChange={(v) => set({ lyrics: { dim: v } })}
          />
        )}
        <div className="srow">
          <span>Previous and next line</span>
          <Toggle
            label="Show the previous and next line"
            on={!!l.context}
            onChange={(v) => set({ lyrics: { context: v } })}
          />
        </div>
        <div className="srow">
          <span>Line-timed songs</span>
          <div className="seg small">
            <button
              className={l.estimated !== 'words' ? 'on' : ''}
              onClick={() => set({ lyrics: { estimated: 'lines' } })}
            >
              Whole lines
            </button>
            <button
              className={l.estimated === 'words' ? 'on' : ''}
              onClick={() => set({ lyrics: { estimated: 'words' } })}
            >
              Guess words
            </button>
          </div>
        </div>
        <p className="fine">
          Most songs only have each line’s start time. Whole lines are always in sync; guessed words
          can drift within a line. Word-timed songs always go word by word.
        </p>
        <div className="srow">
          <span>Clock</span>
          <span className="acct">
            {l.showClock && (
              <Seg
                value={l.clockFont || 'sans'}
                options={[
                  ['sans', 'Sans'],
                  ['serif', 'Serif']
                ]}
                onChange={(v) => set({ lyrics: { clockFont: v } })}
              />
            )}
            <Toggle
              label="Show clock"
              on={l.showClock}
              onChange={(v) => set({ lyrics: { showClock: v } })}
            />
          </span>
        </div>
        <label className="srow">
          <span>Font</span>
          <select value={l.font} onChange={(e) => set({ lyrics: { font: e.target.value } })}>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        {displays.length > 1 && (
          <label className="srow">
            <span>Show on</span>
            <select
              value={String(l.display ?? 'primary')}
              onChange={(e) =>
                set({
                  lyrics: {
                    display: e.target.value === 'primary' ? 'primary' : Number(e.target.value)
                  }
                })
              }
            >
              <option value="primary">Main display</option>
              {displays.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="srow">
          <span>Keep screen awake</span>
          <Toggle
            label="Keep screen awake"
            on={!!settings.awake}
            onChange={(v) => set({ awake: v })}
          />
        </div>
        <p className="fine">
          Keeps the display on while music plays. The overlay steps aside while you’re using this
          window and comes back when you click into another app. Ctrl+Alt+L turns it on or off from
          anywhere.
        </p>
        <div className="srow">
          <span>Frame rate</span>
          <Seg
            value={String(settings.fps === 60 ? 60 : 30)}
            options={[
              ['30', '30 fps'],
              ['60', '60 fps']
            ]}
            onChange={(x) => set({ fps: Number(x) })}
          />
        </div>
        <p className="fine">
          For the edge glow and the lyrics. 60 is smoother; 30 uses about a third less of your
          computer while music plays, and is the default.
        </p>
        <div className="srow">
          <span>Hide for full-screen apps</span>
          <Toggle
            label="Hide for full-screen apps"
            on={settings.hideForFullscreen !== false}
            onChange={(v) => set({ hideForFullscreen: v })}
          />
        </div>
        <p className="fine">
          While a game, a full-screen video or a presentation fills a display, the edge glow, the
          lyrics and the desktop widgets on that display pause and hide, and come back when it
          closes.
          {state.fullscreenApp && settings.hideForFullscreen !== false && ' Hidden right now.'}
        </p>
      </Fold>

      <WidgetSettings settings={settings} set={set} />

      <Fold k="app">
        <div className="sh">
          <h3>Glowtide</h3>
        </div>
        <div className="srow">
          <span>Show in taskbar</span>
          <Toggle
            label="Show in taskbar"
            on={settings.showInTaskbar !== false}
            onChange={(v) => set({ showInTaskbar: v })}
          />
        </div>
        <p className="fine">
          Off, Glowtide lives in the tray only: click its icon there for quick settings, double-click it
          for the player.
        </p>
        <div className="srow">
          <span>Quit Glowtide</span>
          <button className="pill" onClick={() => api.quit()}>
            <Power size={13} /> Quit
          </button>
        </div>
        <p className="fine">Closing this window keeps Glowtide running in the tray. This stops it.</p>
      </Fold>

      <Fold k="source">
        <div className="sh">
          <h3>Music source</h3>
        </div>
        <div className="srow">
          <span>Play from</span>
          <div className="seg small">
            {[
              ['system', 'Any app'],
              ['youtube', 'YouTube'],
              ['spotify', 'Spotify'],
              ['demo', 'Demo']
            ].map(([k, label]) => (
              <button
                key={k}
                className={state.source === k ? 'on' : ''}
                onClick={() => {
                  api.setSource(k)
                  // Spotify without a connection opens its own setup screen: get out of its way.
                  if (k === 'spotify' && !state.connected) onClose?.()
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="srow">
          <span>Spotify</span>
          {state.connected ? (
            <span className="acct">
              {state.spotifyPlan === 'free'
                ? 'Free · follow along'
                : state.spotifyPlan === 'premium'
                  ? 'Premium'
                  : 'Connected'}
              <button className="pill" onClick={() => api.disconnect()}>
                Disconnect
              </button>
            </span>
          ) : (
            <span className="acct muted">Not connected</span>
          )}
        </div>
        <div className="srow">
          <span>YouTube library</span>
          {state.google ? (
            <span className="acct">
              Signed in
              <button className="pill" onClick={() => api.googleDisconnect()}>
                Sign out
              </button>
            </span>
          ) : (
            <span className="acct muted">Links only · sign in from Library</span>
          )}
        </div>
        {state.source === 'youtube' && (
          <p className="fine">
            YouTube plays in Glowtide’s window and pauses when the window is hidden or minimised.
            YouTube’s terms don’t allow playing with the video hidden. YouTube may show ads.
          </p>
        )}
      </Fold>

      <Updates update={state.update} settings={settings} set={set} />
    </div>
  )
}

const UPDATE_TEXT = {
  dev: 'Updates are off in a development run',
  idle: 'Not checked yet',
  checking: 'Checking…',
  current: 'Up to date',
  error: 'Couldn’t check. Are you online?'
}

/** The version, whether a newer one is on the way, and the switch for automatic checks. */
function Updates({ update, settings, set }) {
  const u = update || { status: 'idle' }
  const status =
    u.status === 'downloading'
      ? `Downloading ${u.version}… ${u.percent || 0}%`
      : u.status === 'ready'
        ? `${u.version} is ready`
        : UPDATE_TEXT[u.status] || ''
  return (
    <Fold k="updates">
      <div className="sh">
        <h3>Updates</h3>
      </div>
      <div className="srow">
        <span>Glowtide {u.current}</span>
        <span className="acct">
          <span className="muted">{status}</span>
          {u.status === 'ready' ? (
            <button className="pill on" onClick={() => api.installUpdate()}>
              Restart now
            </button>
          ) : (
            u.status !== 'dev' && (
              <button
                className="pill"
                disabled={u.status === 'checking' || u.status === 'downloading'}
                onClick={() => api.checkUpdate()}
              >
                Check now
              </button>
            )
          )}
        </span>
      </div>
      <div className="srow">
        <span>Check automatically</span>
        <Toggle
          label="Check for updates automatically"
          on={settings.autoUpdate !== false}
          onChange={(v) => set({ autoUpdate: v })}
        />
      </div>
      <p className="fine">
        Glowtide looks for a new release when it starts and every few hours, downloads it in the
        background, and installs it when you restart or quit. Your settings and sign-ins are kept.
      </p>
    </Fold>
  )
}

const PLACES = [
  ['wallpaper', 'Wallpaper'],
  ['top', 'On top'],
  ['window', 'Window']
]

/** The desktop clock widget and the full-screen view. */
function WidgetSettings({ settings, set }) {
  const w = settings.widgets
  const c = w.clock
  const sc = (patch) => set({ widgets: { clock: patch } })
  const themes = ['album', ...Object.keys(THEMES), 'custom']
  return (
    <>
      <Fold k="clock">
        <div className="sh">
          <h3>Desktop clock</h3>
          <Toggle label="Desktop clock" on={c.enabled} onChange={(x) => sc({ enabled: x })} />
        </div>
        {c.enabled && (
          <>
            <div className="srow">
              <span>Lives</span>
              <Seg value={c.placement} options={PLACES} onChange={(x) => sc({ placement: x })} />
            </div>
            <div className="srow">
              <span>Position</span>
              <button className="pill" onClick={() => api.widgetEdit('clock')}>
                Move or resize
              </button>
            </div>
            <div className="srow">
              <span>Face</span>
              <Seg
                value={c.style}
                options={[
                  ['digital', 'Digital'],
                  ['stacked', 'Stacked'],
                  ['minimal', 'Minimal'],
                  ['analog', 'Analog'],
                  ['words', 'Words']
                ]}
                onChange={(x) => sc({ style: x })}
              />
            </div>
            <div className="srow">
              <span>Colour</span>
              <Seg
                value={c.colour}
                options={[
                  ['theme', 'Theme'],
                  ['gradient', 'Gradient'],
                  ['solid', 'White']
                ]}
                onChange={(x) => sc({ colour: x })}
              />
            </div>
            {c.colour !== 'solid' && (
              <div className="theme-row">
                {themes.map((k) => (
                  <button
                    key={k}
                    className={`theme-chip ${(c.theme || 'album') === k ? 'on' : ''}`}
                    onClick={() => sc({ theme: k })}
                  >
                    {k !== 'album' && k !== 'custom' && (
                      <i
                        style={{
                          background: `linear-gradient(90deg, ${vizPalette(k).join(', ')})`
                        }}
                      />
                    )}
                    {k === 'album' ? 'Album' : k}
                  </button>
                ))}
              </div>
            )}
            {c.colour !== 'solid' && c.theme === 'custom' && (
              <label className="srow">
                <span>Accent</span>
                <input
                  type="color"
                  value={w.accent}
                  onChange={(e) => set({ widgets: { accent: e.target.value } })}
                />
              </label>
            )}
            <div className="srow">
              <span>Date</span>
              <Seg
                value={c.date}
                options={[
                  ['long', 'Long'],
                  ['short', 'Short'],
                  ['none', 'Off']
                ]}
                onChange={(x) => sc({ date: x })}
              />
            </div>
            <div className="srow">
              <span>24-hour</span>
              <Toggle label="24-hour" on={c.h24} onChange={(x) => sc({ h24: x })} />
            </div>
            <div className="srow">
              <span>Seconds</span>
              <Toggle label="Seconds" on={c.seconds} onChange={(x) => sc({ seconds: x })} />
            </div>
            <div className="srow">
              <span>Glow</span>
              <Toggle label="Clock glow" on={c.glow} onChange={(x) => sc({ glow: x })} />
            </div>
            <Slider
              label="Opacity"
              min={20}
              max={100}
              value={c.opacity}
              unit="%"
              onChange={(x) => sc({ opacity: x })}
            />
          </>
        )}
      </Fold>
      <Fold k="fullscreen">
        <div className="sh">
          <h3>Full screen</h3>
          <button className="pill" onClick={() => api.stage('open')}>
            Open
          </button>
        </div>
        <p className="fine">
          Ctrl+Alt+F from anywhere. Space plays or pauses, the arrows skip, V changes the
          visualizer, C the colours, Esc leaves.
        </p>
        <div className="srow">
          <span>Frame rate</span>
          <Seg
            value={String(w.fps)}
            options={[
              ['30', '30 fps'],
              ['60', '60 fps']
            ]}
            onChange={(x) => set({ widgets: { fps: Number(x) } })}
          />
        </div>
        <p className="fine">Widgets drop to 20 fps on their own when nothing is playing.</p>
      </Fold>
    </>
  )
}

/** "Override album colour": the glow's own colours, one wheel each, with their share of the edge. */
export function OverrideWheels({ c, g, set }) {
  const two = g.gradient === 2
  const split = g.split ?? 60
  return (
    <div className="wheels">
      <ColourWheel
        label="Primary"
        note={two ? `${split}%` : null}
        value={c.custom}
        onChange={(v) => set({ colour: { custom: v } })}
      />
      {two && (
        <ColourWheel
          label="Secondary"
          note={`${100 - split}%`}
          value={c.custom2 || '#ff5fa2'}
          onChange={(v) => set({ colour: { custom2: v } })}
        />
      )}
    </div>
  )
}

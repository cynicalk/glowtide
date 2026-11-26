import { useEffect, useState } from 'react'
import { Power } from 'lucide-react'
import { STYLES } from './lyricStyles'
import { api, useDisplays } from '../lib/store'
import { DEFAULT_PALETTE, resolveColours } from '../../../shared/colour.mjs'
import { glowAnimation } from '../../../shared/glow.mjs'
import {
  SHORTCUTS,
  acceleratorFrom,
  validAccelerator,
  prettyAccelerator
} from '../../../shared/shortcuts.mjs'
import ColourWheel from './ColourWheel'
import { rememberedMic } from '../lib/mic'
import { micOptions } from '../../../shared/voice.mjs'
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

/**
 * A settings section that folds: click its header to open or close it. Switches and
 * buttons in the header still work without folding. Open/closed is remembered.
 */
/** A settings section. Each tab shows its sections open, so there is nothing to fold. */
function Fold({ k, children }) {
  return <section className={`fold open static s-${k}`}>{children}</section>
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

const TABS = [
  ['glow', 'Glow'],
  ['lyrics', 'Lyrics'],
  ['colours', 'Colours'],
  ['fullscreen', 'Full screen'],
  ['app', 'App']
]

/** The settings tab last shown, remembered in this window. */
function useTab() {
  const [tab, setTab] = useState(() => {
    try {
      const t = localStorage.getItem('settingsTab')
      return TABS.some(([k]) => k === t) ? t : 'glow'
    } catch {
      return 'glow'
    }
  })
  const pick = (t) => {
    setTab(t)
    try {
      localStorage.setItem('settingsTab', t)
    } catch {
      /* remembering is optional */
    }
  }
  return [tab, pick]
}

export default function SettingsPanel({ state, settings, onClose }) {
  const [tab, pickTab] = useTab()
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
      <div className="set-tabs" role="tablist" aria-label="Settings">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`pill ${tab === k ? 'on' : ''}`}
            onClick={() => pickTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'colours' && (
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
      )}

      {tab === 'colours' && <LyricColours c={settings.colour} set={set} />}
      {tab === 'colours' && <BackgroundSettings bg={settings.background} set={set} />}

      {tab === 'glow' && (
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
          <label className="srow">
            <span>Animation</span>
            <select
              value={glowAnimation(g)}
              onChange={(e) => set({ glow: { animation: e.target.value } })}
            >
              {ANIMATION_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
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
          <div className="srow">
            <span>React to the lyrics</span>
            <Toggle
              label="A soft flash as each lyric line starts, the chorus a little brighter"
              on={!!g.lyrics}
              onChange={(v) => set({ glow: { lyrics: v } })}
            />
          </div>
          <p className="fine">
            A soft flash round the edge as each line starts, and the chorus a little brighter. For
            songs with synced lyrics.
          </p>
          <div className="srow">
            <span>Follow the time of day</span>
            <Toggle
              label="Warmer and dimmer glow in the evening and at night"
              on={!!g.timeOfDay}
              onChange={(v) => set({ glow: { timeOfDay: v } })}
            />
          </div>
          <p className="fine">
            True to the cover by day; from 6 pm it eases warmer and up to 40% dimmer, back by 8 am.
          </p>
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
      )}

      {tab === 'lyrics' && (
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
          <Slider
            label="Line spacing"
            min={70}
            max={200}
            step={5}
            value={l.spacing || 100}
            unit="%"
            onChange={(v) => set({ lyrics: { spacing: v } })}
          />
          <div className="srow">
            <span>Backdrop</span>
            <Seg
              value={l.backdrop || 'dim'}
              options={[
                ['none', 'None'],
                ['dim', 'Dim'],
                ['cover', 'Album art'],
                ['flow', 'Flowing']
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
            Most songs only have each line’s start time. Whole lines are always in sync; guessed
            words can drift within a line. Word-timed songs always go word by word.
          </p>
          <div className="srow">
            <span>Check the timing</span>
            <Toggle
              label="Check the lyric timing against the singing"
              on={l.timingCheck !== false}
              onChange={(v) => set({ lyrics: { timingCheck: v } })}
            />
          </div>
          <p className="fine">
            For the first minute of a song, Glowtide listens for when the singing comes in. If the
            lyrics clearly run early or late, it offers to fix them. Needs the edge glow on.
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
            window and comes back when you click into another app. Ctrl+Alt+L turns it on or off
            from anywhere.
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
            While a game, a full-screen video or a presentation fills a display, the edge glow and
            the lyrics on that display pause and hide, and come back when it closes.
            {state.fullscreenApp && settings.hideForFullscreen !== false && ' Hidden right now.'}
          </p>
        </Fold>
      )}

      {tab === 'fullscreen' && <WidgetSettings settings={settings} set={set} />}

      {tab === 'app' && (
        <Fold k="app">
          <div className="sh">
            <h3>Glowtide</h3>
          </div>
          <div className="srow">
            <span>Start with Windows</span>
            <Toggle
              label="Start Glowtide when you sign in to Windows"
              on={settings.startWithWindows !== false}
              onChange={(v) => set({ startWithWindows: v })}
            />
          </div>
          <p className="fine">
            Glowtide starts in the tray when you sign in, with the glow and lyrics ready and the
            window closed.
          </p>
          <div className="srow">
            <span>Button hints</span>
            <Toggle
              label="Show a short description when the pointer rests on a button"
              on={settings.hints !== false}
              onChange={(v) => set({ hints: v })}
            />
          </div>
          <p className="fine">A short description when the pointer rests on a button.</p>
          <div className="srow">
            <span>Pause when headphones come out</span>
            <Toggle
              label="Pause when headphones or earbuds disconnect"
              on={settings.pauseOnUnplug !== false}
              onChange={(v) => set({ pauseOnUnplug: v })}
            />
          </div>
          <p className="fine">
            Unplug your headphones or let your earbuds disconnect, and the music pauses instead of
            playing out loud.
          </p>
          <div className="srow">
            <span>Reduce motion</span>
            <Toggle
              label="Hold the covers and messages still"
              on={!!settings.reduceMotion}
              onChange={(v) => set({ reduceMotion: v })}
            />
          </div>
          <p className="fine">
            Covers stop drifting and messages appear without gliding. Glowtide moves even when the
            animation effects in Windows are off; this is its own switch.
          </p>
          <div className="srow">
            <span>Show in taskbar</span>
            <Toggle
              label="Show in taskbar"
              on={settings.showInTaskbar !== false}
              onChange={(v) => set({ showInTaskbar: v })}
            />
          </div>
          <p className="fine">
            Off, Glowtide lives in the tray only: click its icon there for quick settings,
            double-click it for the player.
          </p>
          <div className="srow">
            <span>Quit Glowtide</span>
            <button className="pill" onClick={() => api.quit()}>
              <Power size={13} /> Quit
            </button>
          </div>
          <p className="fine">
            Closing this window keeps Glowtide running in the tray. This stops it.
          </p>
        </Fold>
      )}

      {tab === 'app' && (
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
          <div className="srow">
            <span>Search YouTube with</span>
            <Seg
              value={settings.ytSearch === 'official' ? 'official' : 'innertube'}
              options={[
                ['innertube', 'InnerTube'],
                ['official', 'YouTube API']
              ]}
              onChange={(v) => set({ ytSearch: v })}
            />
          </div>
          <p className="fine">
            InnerTube is YouTube&apos;s own search: no sign-in and no daily limit. The YouTube API
            is the official one: it needs the Google sign-in (Library) and allows about 100 searches
            a day. The other one steps in if the chosen one can&apos;t answer. Songs play in
            YouTube&apos;s official player either way.
          </p>
          {state.source === 'youtube' && (
            <p className="fine">
              YouTube plays in Glowtide’s window and pauses when the window is hidden or minimised.
              YouTube’s terms don’t allow playing with the video hidden. YouTube may show ads.
            </p>
          )}
        </Fold>
      )}

      {tab === 'app' && (
        <Fold k="mini">
          <div className="sh">
            <h3>Mini player</h3>
          </div>
          <div className="srow">
            <span>Beside the tray</span>
            <Toggle
              label="A small player above the taskbar, by the clock"
              on={!!settings.mini?.enabled}
              onChange={(v) => set({ mini: { enabled: v } })}
            />
          </div>
          {settings.mini?.enabled && (
            <div className="srow">
              <span>Extra buttons</span>
              <div className="seg small">
                {[
                  ['like', 'Like'],
                  ['shuffle', 'Shuffle'],
                  ['repeat', 'Repeat']
                ].map(([k, label]) => (
                  <button
                    key={k}
                    className={settings.mini[k] ? 'on' : ''}
                    aria-pressed={!!settings.mini[k]}
                    onClick={() => set({ mini: { [k]: !settings.mini[k] } })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="fine">
            The cover, the song and previous / play / next, just above the taskbar on your main
            display. Click the cover for the player. It hides while nothing plays and while a game
            or video fills the screen.
          </p>
        </Fold>
      )}
      {tab === 'app' && (
        <Shortcuts settings={settings} set={set} taken={state.shortcutsTaken || []} />
      )}
      {tab === 'app' && <VoiceSettings settings={settings} set={set} voice={state.voice} />}
      {tab === 'app' && <CallSettings settings={settings} set={set} />}
      {tab === 'app' && <RemoteSettings settings={settings} set={set} />}
      {tab === 'app' && <BackupSettings />}
      {tab === 'app' && <Updates update={state.update} settings={settings} set={set} />}
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
/**
 * Global shortcuts: click one, press the keys (with Ctrl, Alt or Win). Backspace removes it,
 * Esc keeps it. Glowtide's own shortcuts are off while recording, so they can be re-set.
 */
function Shortcuts({ settings, set, taken }) {
  const [rec, setRec] = useState(null)
  const [hint, setHint] = useState('')
  const cur = settings.shortcuts || {}
  // leaving Settings mid-recording turns Glowtide's shortcuts back on
  useEffect(() => {
    if (!rec) return
    return () => api.recordingShortcut(false)
  }, [rec])
  const stop = () => {
    setRec(null)
    api.recordingShortcut(false)
  }
  const press = (id, e) => {
    if (rec !== id) return
    e.preventDefault()
    if (e.key === 'Escape') return stop()
    if (e.key === 'Backspace' || e.key === 'Delete') {
      set({ shortcuts: { [id]: '' } })
      return stop()
    }
    const acc = acceleratorFrom(e)
    if (!acc) return // only modifiers so far
    if (!validAccelerator(acc))
      return setHint(
        'Use two of Ctrl, Alt and Shift, or Win, with the key (Ctrl+Alt+K): one is every app’s own'
      )
    const clash = SHORTCUTS.find((s) => s.id !== id && cur[s.id] === acc)
    if (clash) return setHint(`Already used for “${clash.label}”`)
    set({ shortcuts: { [id]: acc } })
    setHint('')
    stop()
  }
  return (
    <Fold k="shortcuts">
      <div className="sh">
        <h3>Shortcuts</h3>
      </div>
      {SHORTCUTS.map((s) => (
        <div className="srow" key={s.id}>
          <span>{s.label}</span>
          <span className="keys">
            {taken.includes(s.id) && <span className="key-taken">another app has it</span>}
            <button
              className={`pill keycap ${rec === s.id ? 'on' : ''}`}
              onClick={() => {
                setHint('')
                setRec(s.id)
                api.recordingShortcut(true)
              }}
              onKeyDown={(e) => press(s.id, e)}
              onBlur={() => rec === s.id && stop()}
            >
              {rec === s.id ? 'Press keys…' : cur[s.id] ? prettyAccelerator(cur[s.id]) : 'None'}
            </button>
          </span>
        </div>
      ))}
      <p className="fine">
        {hint ||
          'Click one and press the keys; Backspace removes it, Esc keeps it. They work from any app.'}
      </p>
      <p className="fine">
        In the player: Space plays or pauses, Ctrl+← → skip songs, Shift+← → jump 15 s, [ and ]
        nudge the lyrics (Shift for 0.5 s), L likes.
      </p>
    </Fold>
  )
}

/** Lyrics in your own three colours instead of the cover's. */
function LyricColours({ c, set }) {
  return (
    <Fold k="lyriccolours">
      <div className="sh">
        <h3>Lyric colours</h3>
        <Toggle
          label="Your own lyric colours"
          on={!!c.lyricsOwn}
          onChange={(v) => set({ colour: { lyricsOwn: v } })}
        />
      </div>
      {c.lyricsOwn &&
        [
          ['sung', 'Words being sung'],
          ['unsung', 'The other words'],
          ['next', 'Highlight']
        ].map(([k, label]) => (
          <div className="srow" key={k}>
            <span>{label}</span>
            <ColourInput value={c[k]} onChange={(v) => set({ colour: { [k]: v } })} />
          </div>
        ))}
      <p className="fine">
        Off, the lyrics take their colours from the album art. The highlight is the next word’s
        block and the karaoke sweep.
      </p>
    </Fold>
  )
}

/** A colour well that saves once you stop moving, not on every step of a drag. */
function ColourInput({ value, onChange }) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    setV(value)
  }
  useEffect(() => {
    if (v === value) return
    const id = setTimeout(() => onChange(v), 200)
    return () => clearTimeout(id)
  }, [v, value, onChange])
  return (
    <input type="color" className="colour-well" value={v} onChange={(e) => setV(e.target.value)} />
  )
}

/** Behind the player: the cover, flowing colours, or your own picture or video. */
function BackgroundSettings({ bg, set }) {
  const [err, setErr] = useState('')
  const own = bg.kind === 'image' || bg.kind === 'video'
  const pick = async () => {
    setErr('')
    const r = await api.pickBackground()
    if (r?.error) setErr(r.error)
  }
  return (
    <Fold k="background">
      <div className="sh">
        <h3>Background</h3>
      </div>
      <div className="srow">
        <span>Behind the player</span>
        <Seg
          value={own ? 'own' : bg.kind}
          options={[
            ['cover', 'Cover'],
            ['flow', 'Flowing'],
            ['own', 'Picture or video']
          ]}
          onChange={(v) => {
            if (v !== 'own') return set({ background: { kind: v } })
            if (bg.file)
              set({ background: { kind: /\.(mp4|webm)$/.test(bg.file) ? 'video' : 'image' } })
            else pick()
          }}
        />
      </div>
      {own && (
        <>
          <div className="srow">
            <span>{bg.kind === 'video' ? 'Your video' : 'Your picture'}</span>
            <button className="pill" onClick={pick}>
              Choose another…
            </button>
          </div>
          <Slider
            label="Strength"
            min={10}
            max={100}
            value={bg.opacity}
            unit="%"
            onChange={(v) => set({ background: { opacity: v } })}
          />
        </>
      )}
      {bg.kind !== 'cover' && (
        <div className="srow">
          <span>In the full-screen view too</span>
          <Toggle
            label="Use this background in the full-screen view"
            on={!!bg.fullscreen}
            onChange={(v) => set({ background: { fullscreen: v } })}
          />
        </div>
      )}
      {err && <p className="fine warn">{err}</p>}
      <p className="fine">
        Flowing: soft blobs of the cover’s colours drifting past each other. A picture or a video
        (MP4 or WebM, silent and looping, like a live wallpaper) is copied into Glowtide’s settings
        folder; a video pauses whenever it can’t be seen.
      </p>
    </Fold>
  )
}

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

/** The full-screen view. */
function WidgetSettings({ settings, set }) {
  const w = settings.widgets
  return (
    <>
      <Fold k="fullscreen">
        <div className="sh">
          <h3>Full screen</h3>
          <button className="pill" onClick={() => api.stage('open')}>
            Open
          </button>
        </div>
        <p className="fine">
          Ctrl+Alt+F from anywhere. Space plays or pauses, the arrows skip, V changes the
          visualizer, C the colours, B the background, Esc leaves.
        </p>
        <div className="srow">
          <span>Background</span>
          <Seg
            value={w.stage?.backdrop === 'art' ? 'art' : 'blur'}
            options={[
              ['blur', 'Blurred, with visualizer'],
              ['art', 'Album art']
            ]}
            onChange={(x) => set({ widgets: { stage: { backdrop: x } } })}
          />
        </div>
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
        <p className="fine">It drops to 20 fps on its own when nothing is playing.</p>
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

/** Speaking to the command bar: the wake word, and the speech model it needs. */
function VoiceSettings({ settings, set, voice }) {
  const wake = !!settings.voice?.wake
  const mic = settings.voice?.mic || ''
  const [sure, setSure] = useState(false)
  // the microphones, from Windows (not the page's device list, which costs ~100 MB that stays)
  const [labels, setLabels] = useState([])
  useEffect(() => {
    let live = true
    api.voiceMics().then((l) => live && setLabels(Array.isArray(l) ? l : []))
    return () => {
      live = false
    }
  }, [])
  const mics = micOptions(labels, mic, rememberedMic()?.label || '')
  const mb = Math.round((voice?.bytes || 0) / 1e6)
  const turn = async (v) => {
    if (v && !voice?.ready) {
      const s = await api.voiceDownload() // the wake word needs the model to understand you
      if (!s?.ready) return
    }
    set({ voice: { wake: v } })
  }
  return (
    <Fold k="voice">
      <div className="sh">
        <h3>Voice</h3>
        <Toggle label='Listen for "Hey Glow"' on={wake} onChange={turn} />
      </div>
      <p className="fine">
        Say a song or a command to the command bar: press its microphone or Ctrl+Alt+V, then
        &ldquo;next song&rdquo;, &ldquo;volume forty&rdquo;, &ldquo;play Blinding Lights&rdquo; or
        &ldquo;add Levitating to the queue&rdquo;. With the switch on, saying &ldquo;Hey Glow&rdquo;
        opens it listening.
      </p>
      <p className="fine">
        Everything is understood on this PC and nothing you say is kept or sent anywhere. While
        &ldquo;Hey Glow&rdquo; is on, Windows shows its microphone icon: Windows&apos; own speech
        recogniser is listening for that phrase, and only that phrase.
      </p>
      <div className="srow">
        <span>Microphone</span>
        {mics.options.length ? (
          <select value={mics.value} onChange={(e) => set({ voice: { mic: e.target.value } })}>
            {mics.options.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <span className="fine">No microphone found</span>
        )}
      </div>
      <p className="fine">
        Stereo Mix and similar inputs aren&apos;t listed: they record what the PC plays, not your
        voice.
      </p>
      {wake && voice?.lastHeard && (
        <p className="fine" role="status">
          Last heard{' '}
          {voice.lastHeard.text ? <>&ldquo;{voice.lastHeard.text}&rdquo;</> : '“Hey Glow”'}{' '}
          {voice.lastHeard.opened ? '— opened the command bar' : '— not the wake word, ignored'}
        </p>
      )}
      <div className="srow">
        <span>
          Speech model{' '}
          <span className="fine">
            {voice?.downloading
              ? `downloading… ${voice.percent}%`
              : voice?.ready
                ? `on this PC (${mb} MB)`
                : `not downloaded (${mb} MB, once)`}
          </span>
        </span>
        <span className="stats-confirm">
          {!voice?.ready && !voice?.downloading && (
            <button className="pill" onClick={() => api.voiceDownload()}>
              Download
            </button>
          )}
          {voice?.ready &&
            (sure ? (
              <>
                <button
                  className="pill"
                  onClick={async () => {
                    setSure(false)
                    if (wake) set({ voice: { wake: false } })
                    await api.voiceRemove()
                  }}
                >
                  Remove it
                </button>
                <button className="pill" onClick={() => setSure(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button className="pill" onClick={() => setSure(true)}>
                Remove…
              </button>
            ))}
        </span>
      </div>
      {voice?.error && !voice.downloading && (
        <p className="fine" role="status">
          The download didn&apos;t finish: {voice.error}
        </p>
      )}
      {wake && voice?.wakeError && (
        <p className="fine" role="status">
          {voice.wakeError === 'no-recogniser'
            ? "“Hey Glow” needs Windows' English speech recogniser: Settings → Time & language → Language & region, add English (United States), and include its speech options."
            : voice.wakeError === 'no-microphone'
              ? "“Hey Glow” can't hear you: no microphone was found (Stereo Mix and the like record the PC, not you)."
              : `“Hey Glow” can't hear you: ${voice.wakeError}`}
        </p>
      )}
    </Fold>
  )
}

/** Quieter during calls: on or off, which apps count as a call, and how quiet. */
function CallSettings({ settings, set }) {
  const c = settings.calls || { enabled: false, mode: 'calls', level: 30 }
  return (
    <Fold k="calls">
      <div className="sh">
        <h3>Quieter during calls</h3>
        <Toggle
          label="Turn the music down during calls"
          on={!!c.enabled}
          onChange={(v) => set({ calls: { enabled: v } })}
        />
      </div>
      <p className="fine">
        While you’re on a call, the music goes down and comes back up when the call ends. A call is
        an app using your microphone: Discord, Teams, Zoom, WhatsApp, Slack, or a browser (Meet).
      </p>
      {c.enabled && (
        <>
          <div className="srow">
            <span>Counts as a call</span>
            <Seg
              value={c.mode === 'any' ? 'any' : 'calls'}
              options={[
                ['calls', 'Call apps'],
                ['any', 'Any app using the mic']
              ]}
              onChange={(v) => set({ calls: { mode: v } })}
            />
          </div>
          <Slider
            label="Music during a call"
            min={0}
            max={80}
            value={c.level ?? 30}
            unit="%"
            onChange={(v) => set({ calls: { level: v } })}
          />
          <p className="fine">
            Any app: only that app goes down, in the Windows volume mixer. If the call is in the
            same browser as the music, the music pauses instead and plays again afterwards.
          </p>
        </>
      )}
    </Fold>
  )
}

/** The phone remote: on or off, the address to open, a pairing code, paired phones. */
function RemoteSettings({ settings, set }) {
  const on = !!settings.remote?.enabled
  const [st, setSt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (!on) return
    let alive = true
    const load = () => api.remoteStatus().then((s) => alive && setSt(s))
    load()
    const id = setInterval(() => {
      load()
      setNow(Date.now())
    }, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [on])
  const code = on ? st?.pairing : null
  const left = code ? Math.max(0, Math.ceil((code.until - now) / 1000)) : 0
  return (
    <Fold k="remote">
      <div className="sh">
        <h3>Phone remote</h3>
        <Toggle label="Phone remote" on={on} onChange={(v) => set({ remote: { enabled: v } })} />
      </div>
      <p className="fine">
        Control the music and read the lyrics from your phone, on the same Wi-Fi. The first time,
        Windows asks whether Glowtide may use the network: allow it on private networks.
      </p>
      {on && st && (
        <>
          {st.error ? (
            <div className="error">{st.error}</div>
          ) : st.addresses.length ? (
            <div className="srow">
              <span>On your phone, open</span>
              <span className="remote-addr">
                {st.addresses.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </span>
            </div>
          ) : (
            <p className="fine">This PC isn’t on a home network right now.</p>
          )}
          <div className="srow">
            <span>Pair a phone</span>
            {code && left > 0 ? (
              <span className="remote-code" aria-live="polite">
                <b>{code.code}</b> <small>{left} s</small>
              </span>
            ) : (
              <button className="pill" onClick={() => api.remotePair()}>
                Get a code
              </button>
            )}
          </div>
          <div className="srow">
            <span>Paired phones</span>
            {st.phones ? (
              sure ? (
                <span className="stats-confirm">
                  <button
                    className="pill on"
                    onClick={async () => {
                      await api.remoteForget()
                      setSure(false)
                    }}
                  >
                    Forget all
                  </button>
                  <button className="pill" onClick={() => setSure(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="pill" onClick={() => setSure(true)}>
                  {st.phones} · Forget…
                </button>
              )
            ) : (
              <span className="muted">None yet</span>
            )}
          </div>
          <p className="fine">
            Only phones you pair with a code can use it, and only from your home network. After
            pairing, a phone signs each request instead of sending its key, so pair on Wi-Fi you
            trust. Phones paired before 1.0.22 need pairing again.
          </p>
        </>
      )}
    </Fold>
  )
}

/** Back up your setup to a file, or bring one in (on a new PC, after a reinstall). */
function BackupSettings() {
  const [note, setNote] = useState('')
  const run = async (fn) => {
    setNote('')
    const r = await fn()
    if (!r) return
    if (r.error) setNote(r.error)
    else if (r.path) setNote('Saved.')
    else if (r.ok)
      setNote(
        `Brought in: ${r.counts.lyrics} timed ${r.counts.lyrics === 1 ? 'song' : 'songs'}, ${r.counts.plays} plays.`
      )
  }
  return (
    <Fold k="backup">
      <div className="sh">
        <h3>Backup</h3>
      </div>
      <p className="fine">
        One file with your settings, the lyrics you timed, the versions you picked, your per-song
        nudges and your listening history. Bring it in on another PC or after a reinstall. Sign-ins
        (Spotify, Google), paired phones and your own background picture or video stay on this PC.
      </p>
      <div className="srow">
        <span>Your setup</span>
        <span className="stats-confirm">
          <button className="pill" onClick={() => run(api.exportBackup)}>
            Back up…
          </button>
          <button className="pill" onClick={() => run(api.importBackup)}>
            Bring in…
          </button>
        </span>
      </div>
      {note && (
        <p className="fine" role="status">
          {note}
        </p>
      )}
    </Fold>
  )
}

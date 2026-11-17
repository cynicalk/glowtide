import { api } from '../lib/store'
import { DEFAULT_PALETTE, resolveColours } from '../../../shared/colour.mjs'

const FONTS = [
  'Segoe UI Variable Display',
  'Bahnschrift',
  'Arial Black',
  'Georgia',
  'Consolas',
  'Impact'
]

function Toggle({ on, onChange, label }) {
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

function Slider({ label, value, min, max, step = 1, onChange, unit = '' }) {
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

export default function SettingsPanel({ state, settings }) {
  const c = settings.colour
  const g = settings.glow
  const l = settings.lyrics
  const palette = state.palette || DEFAULT_PALETTE
  const resolved = resolveColours(state.palette, c)
  const set = (patch) => api.setSettings(patch)
  const album = c.source === 'album'

  return (
    <div className="settings">
      <section>
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
              Custom
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
        {!album && (
          <label className="srow">
            <span>Custom colour</span>
            <input
              type="color"
              value={c.custom}
              onChange={(e) => set({ colour: { custom: e.target.value } })}
            />
          </label>
        )}
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
      </section>

      <section>
        <div className="sh">
          <h3>Edge glow</h3>
          <Toggle
            label="Edge glow"
            on={g.enabled}
            onChange={(v) => set({ glow: { enabled: v } })}
          />
        </div>
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
          <span>Pulse with the music</span>
          <Toggle
            label="Pulse with the music"
            on={g.reactToAudio}
            onChange={(v) => set({ glow: { reactToAudio: v } })}
          />
        </div>
        <p className="fine">Listens to this PC’s sound output, never the microphone.</p>
        <div className="srow">
          <span>Displays</span>
          <div className="seg small">
            <button
              className={g.displays === 'all' ? 'on' : ''}
              onClick={() => set({ glow: { displays: 'all' } })}
            >
              All
            </button>
            <button
              className={g.displays === 'primary' ? 'on' : ''}
              onClick={() => set({ glow: { displays: 'primary' } })}
            >
              Main only
            </button>
          </div>
        </div>
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
      </section>

      <section>
        <div className="sh">
          <h3>Lyrics overlay</h3>
          <Toggle
            label="Lyrics overlay"
            on={l.overlay}
            onChange={(v) => set({ lyrics: { overlay: v } })}
          />
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
          label="Dim desktop"
          min={0}
          max={85}
          value={l.dim}
          unit="%"
          onChange={(v) => set({ lyrics: { dim: v } })}
        />
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
          <span>Show clock</span>
          <Toggle
            label="Show clock"
            on={l.showClock}
            onChange={(v) => set({ lyrics: { showClock: v } })}
          />
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
        <p className="fine">
          The overlay steps aside while you’re using this window and comes back when you click into
          another app. Ctrl+Alt+L turns it on or off from anywhere.
        </p>
      </section>

      <section>
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
                onClick={() => api.setSource(k)}
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
      </section>
    </div>
  )
}

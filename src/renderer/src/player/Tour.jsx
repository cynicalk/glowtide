import { useEffect, useState } from 'react'
import { Lightbulb, MicVocal, Command, Power } from 'lucide-react'
import { api } from '../lib/store'
import { Toggle } from './SettingsPanel'

/**
 * The first-run tour: four short cards on what Glowtide does and where things are, ending
 * with the start-with-Windows choice. Shown once (after the music source is picked); Skip
 * or Esc ends it, and it never shows again.
 */
export default function Tour({ settings }) {
  const [step, setStep] = useState(0)
  const done = () => api.setSettings({ tourDone: true })
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && api.setSettings({ tourDone: true })
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const steps = [
    {
      icon: <Lightbulb size={22} />,
      title: 'Your screen, in the album’s colours',
      body: 'A soft glow runs round the edges of your screen in the colours of what’s playing, and can swell with the beat. Change it from the bulb on the right, or by clicking the tray icon.'
    },
    {
      icon: <MicVocal size={22} />,
      title: 'Lyrics on your desktop',
      body: 'The words appear over your desktop as they’re sung, in seven styles. Ctrl+Alt+L turns them on and off; the microphone on the right shows them in this window instead.'
    },
    {
      icon: <Command size={22} />,
      title: 'Quick to reach',
      body: 'Ctrl+Alt+Space opens the command bar: type a song, or “next”, “volume 40”, “share”. Click the tray icon for quick settings, or turn on the mini player by the clock.',
      extra: (
        <div className="tour-row">
          <span>Mini player by the clock</span>
          <Toggle
            label="Mini player beside the tray"
            on={!!settings.mini?.enabled}
            onChange={(v) => api.setSettings({ mini: { enabled: v } })}
          />
        </div>
      )
    },
    {
      icon: <Power size={22} />,
      title: 'Ready when you are',
      body: 'Glowtide can start in the tray when you sign in, so the glow and lyrics are there as soon as music plays. Everything else is in Settings.',
      extra: (
        <div className="tour-row">
          <span>Start with Windows</span>
          <Toggle
            label="Start Glowtide when you sign in to Windows"
            on={settings.startWithWindows !== false}
            onChange={(v) => api.setSettings({ startWithWindows: v })}
          />
        </div>
      )
    }
  ]
  const s = steps[step]
  const last = step === steps.length - 1
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Welcome to Glowtide">
      <div className="tour-card">
        <div className="tour-icon">{s.icon}</div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        {s.extra}
        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="pill ghost" onClick={done}>
            Skip
          </button>
          <span className="tour-gap" />
          {step > 0 && (
            <button className="pill" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="pill on" autoFocus onClick={() => (last ? done() : setStep(step + 1))}>
            {last ? 'Start' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

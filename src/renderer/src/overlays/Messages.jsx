import { memo } from 'react'

/**
 * Messages: each sung line is a text message. The bubble fills word by word as the line is
 * sung, each word fading in; lines alternate between a dark bubble on the left and a blue
 * one on the right; the two before the current one rise, fade and blur away. The song's
 * first message carries its title and artist beneath, like a shared location.
 * Used by the lyrics overlay and by the player's full-window cover.
 */
function MessagesView({ view, track }) {
  if (!view) return null
  const detail = track ? [track.name, (track.artists || '').split(',')[0]].filter(Boolean) : []
  return (
    <div className="msgs" aria-hidden="true">
      {view.items.map((m) => (
        <div key={m.i} className={`msg ${m.from} age-${m.age}`}>
          <div className="bubble">
            <div className="msg-text">
              {m.words.map((w, k) => (
                <span key={k} className="mw">
                  {w}{' '}
                </span>
              ))}
            </div>
            {m.first && detail.length > 0 && (
              <div className="msg-detail">
                <span className="pin">➤</span> {detail.join(', ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Re-rendered only when a word, a line or the song changes, however often it is asked. */
export const Messages = memo(
  MessagesView,
  (a, b) => a.view?.key === b.view?.key && !!a.view === !!b.view && a.track?.id === b.track?.id
)

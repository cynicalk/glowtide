import { memo, useLayoutEffect, useRef } from 'react'

/**
 * Messages: each sung line is a text message. The bubble fills word by word as the line is
 * sung, each word fading in; lines alternate between a dark bubble on the left and a blue
 * one on the right; the two before the current one rise, fade and blur away. The song's
 * first message carries its title and artist beneath, like a shared location.
 * Used by the lyrics overlay and by the player (its lyrics view and its full-window cover).
 *
 * Nothing jumps: a bubble grows smoothly to take each new word, the messages above glide up
 * to make room, the oldest fades out rather than vanishing, and a long gap fades them all.
 */
function MessagesView({ view, track }) {
  const box = useRef(null)
  useGlide(box, view?.key, track?.id)
  if (!view) return null
  const detail = track ? [track.name, (track.artists || '').split(',')[0]].filter(Boolean) : []
  return (
    <div className={`msgs ${view.leaving ? 'leaving' : ''}`} ref={box} aria-hidden="true">
      {view.items.map((m) => (
        <div key={`${track?.id}:${m.i}`} data-k={m.i} className={`msg ${m.from} age-${m.age}`}>
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

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * After each change, every message that moved glides from where it was shown to its new
 * place, and a bubble that grew opens out to its new size from its fixed corner (the left
 * one's bottom-left, the right one's bottom-right). Transform and clip only: the text is
 * laid out once, at its final size, and never reflows mid-motion.
 */
function useGlide(box, key, trackId) {
  const last = useRef({ track: null, rows: new Map() })
  useLayoutEffect(() => {
    const el = box.current
    const prev = last.current.track === trackId ? last.current.rows : new Map()
    const rows = new Map()
    if (!el) {
      last.current = { track: trackId, rows }
      return
    }
    for (const row of el.children) {
      const bubble = row.firstElementChild
      // where it shows now, mid-glide included, before the glide is replaced
      const shown = new DOMMatrixReadOnly(getComputedStyle(row).transform).m42 || 0
      for (const a of row.getAnimations()) if (a.id === 'glide') a.cancel()
      const r = row.getBoundingClientRect()
      const b = bubble.getBoundingClientRect()
      const k = row.dataset.k
      rows.set(k, { top: r.top, w: b.width, h: b.height })
      const p = prev.get(k)
      if (!p) continue
      // shown before this change: its old place plus the glide it was partway through
      const dy = p.top + shown - r.top
      if (Math.abs(dy) > 0.5)
        row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
          id: 'glide',
          duration: 520,
          easing: EASE
        })
      const gw = Math.max(0, b.width - p.w)
      const gh = Math.max(0, b.height - p.h)
      if (gw > 0.5 || gh > 0.5) {
        const radius = getComputedStyle(bubble).borderTopLeftRadius
        // the side that stays put is left open, so the bubble's shadow isn't cut off
        const clip = (x, y) =>
          row.classList.contains('me')
            ? `inset(${y}px -3em -3em ${x}px round ${radius})`
            : `inset(${y}px ${x}px -3em -3em round ${radius})`
        bubble.animate([{ clipPath: clip(gw, gh) }, { clipPath: clip(0, 0) }], {
          duration: 260,
          easing: EASE
        })
      }
    }
    last.current = { track: trackId, rows }
  }, [box, key, trackId])
}

/** Re-rendered only when a word, a line or the song changes, however often it is asked. */
export const Messages = memo(
  MessagesView,
  (a, b) => a.view?.key === b.view?.key && !!a.view === !!b.view && a.track?.id === b.track?.id
)

import { useRef } from 'react'
import { Check } from 'lucide-react'
import { api } from '../lib/store'

/**
 * Move-and-resize chrome for a desktop widget.
 * place 'edit': dashed outline, a hint and Done (puts it back where it lives).
 * place 'edit' | 'top' | 'window': a corner grip to resize, since see-through windows have
 * no resize edges on Windows. Dragging anywhere else moves the window.
 */
export default function EditChrome({ kind, place }) {
  const drag = useRef(null)
  if (place === 'wallpaper') return null

  const down = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      x: e.screenX,
      y: e.screenY,
      w: window.innerWidth,
      h: window.innerHeight,
      raf: 0
    }
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    cancelAnimationFrame(d.raf)
    d.raf = requestAnimationFrame(() =>
      api.widgetResize(kind, d.w + (e.screenX - d.x), d.h + (e.screenY - d.y))
    )
  }
  const up = (e) => {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  return (
    <>
      {place === 'edit' && (
        <div className="edit-frame">
          <div className="edit-hint">Drag to move · drag the corner to resize</div>
          <button className="edit-done" onClick={() => api.widgetDone(kind)}>
            <Check size={14} /> Done
          </button>
        </div>
      )}
      <div
        className={`edit-grip ${place === 'edit' ? 'show' : ''}`}
        title="Drag to resize"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </>
  )
}

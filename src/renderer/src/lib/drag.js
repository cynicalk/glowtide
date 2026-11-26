import { api } from './store'

/**
 * Pointer handlers that move this window while it's dragged by anything that isn't a button:
 * the main process follows the pointer from the press to the release (see dragWindow there).
 */
export function dragHandlers() {
  const end = () => api.dragWindow('end')
  return {
    onPointerDown: (e) => {
      if (e.button !== 0 || e.target.closest('button, input, a')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      api.dragWindow('start')
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end
  }
}

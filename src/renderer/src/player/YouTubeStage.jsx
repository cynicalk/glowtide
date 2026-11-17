import { useEffect, useRef } from 'react'
import { api } from '../lib/store'

/**
 * Frames the local page that hosts YouTube's official player and relays messages:
 * player state -> main process, commands from main -> player.
 * The video is shown, never hidden: YouTube's terms require a visible player.
 */
export default function YouTubeStage({ state, onOpenLibrary }) {
  const frame = useRef(null)
  const origin = state.ytHostOrigin

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return
      if (e.data?.glowtide === 'yt') api.ytState(e.data)
    }
    window.addEventListener('message', onMsg)
    const off = api.onYtCommand((cmd) =>
      frame.current?.contentWindow?.postMessage({ glowtide: 'cmd', ...cmd }, origin)
    )
    return () => {
      window.removeEventListener('message', onMsg)
      off()
    }
  }, [origin])

  return (
    <div className="yt-stage">
      <iframe
        ref={frame}
        title="YouTube player"
        src={`${origin}/yt`}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {!state.track && (
        <button className="yt-empty" onClick={onOpenLibrary}>
          Open library
        </button>
      )}
    </div>
  )
}

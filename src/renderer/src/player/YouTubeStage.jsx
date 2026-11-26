import { useEffect, useRef } from 'react'
import { GripHorizontal } from 'lucide-react'
import { api } from '../lib/store'

/** The grip above the video in the cover view. */
export function YtGrip({ off, grip }) {
  return (
    <div
      className="yt-grip"
      style={{ transform: `translate(${off.x}px, ${off.y}px)` }}
      title="Drag to move the video · double-click to put it back"
      {...grip}
    >
      <GripHorizontal size={14} />
    </div>
  )
}

/**
 * Frames the page that hosts YouTube's official player (on GitHub Pages: see main/ytHost.js)
 * and relays messages:
 * player state -> main process, commands from main -> player.
 * The video is shown, never hidden: YouTube's terms require a visible player.
 */
export default function YouTubeStage({ state, onOpenLibrary, style }) {
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
    <div className="yt-stage" style={style}>
      <iframe
        ref={frame}
        title="YouTube player"
        src={state.ytPageUrl}
        allow="autoplay; encrypted-media; picture-in-picture"
        // a page on the web: it may run its scripts and the player, open YouTube links (in the
        // browser, see the player window's link handler) and go full screen, nothing more
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
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

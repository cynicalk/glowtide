import { useEffect, useRef } from 'react'

// Backgrounds behind the player, the desktop lyrics and the full-screen view.

/** Your picture or video, as Glowtide stored it (settings folder, served as glowtide-bg://). */
const FILE = /^bg-\d+\.(jpe?g|png|webp|gif|mp4|webm)$/

/**
 * Flowing colours: four soft blobs of the cover's colours drifting slowly past each other,
 * the colours easing over when the song changes. Transform only (the compositor moves them;
 * nothing is repainted), and still under Reduce motion.
 */
export function FlowBackground({ colours, className = '' }) {
  const c = colours || {}
  return (
    <div
      className={`flow ${className}`}
      aria-hidden="true"
      style={{
        '--f1': c.glow || '#6a5cff',
        '--f2': c.glow2 || c.highlight || '#ff5fa2',
        '--f3': c.highlight || '#ffb35f',
        '--f4': c.secondary || '#5fb4ff'
      }}
    >
      <i />
      <i />
      <i />
      <i />
    </div>
  )
}

/**
 * The background you chose in Settings → Colours → Background, when it isn't the cover:
 * flowing colours, or your picture or video (silent, looping, paused while unseen).
 */
export function Wallpaper({ bg, colours, className = '' }) {
  if (!bg) return null
  if (bg.kind === 'flow') return <FlowBackground colours={colours} className={className} />
  if ((bg.kind !== 'image' && bg.kind !== 'video') || !FILE.test(bg.file || '')) return null
  const src = `glowtide-bg://bg/${bg.file}`
  const style = { opacity: Math.max(0.1, Math.min(1, (bg.opacity ?? 70) / 100)) }
  // a dark veil over your picture or video keeps the text on top readable, however bright
  return (
    <div className={`wall-box ${className}`}>
      {bg.kind === 'video' ? (
        <BgVideo src={src} style={style} />
      ) : (
        <img className="wall" src={src} style={style} alt="" />
      )}
      <div className="wall-veil" />
    </div>
  )
}

function BgVideo({ src, style }) {
  const v = useRef(null)
  useEffect(() => {
    const sync = () => {
      const el = v.current
      if (!el) return
      if (document.hidden) el.pause()
      else el.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => document.removeEventListener('visibilitychange', sync)
  }, [src])
  return (
    <video
      ref={v}
      className="wall"
      src={src}
      style={style}
      muted
      loop
      playsInline
      autoPlay
      disablePictureInPicture
    />
  )
}

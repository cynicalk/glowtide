import Glow from './overlays/Glow'
import LyricsOverlay from './overlays/LyricsOverlay'
import MiniPlayer from './player/MiniPlayer'
import CommandBar from './player/CommandBar'

/**
 * Development only (scripts/make-demo.cjs): a pretend desktop for the demo video, with the
 * real edge glow, desktop lyrics and mini player drawn into one window, and the command bar
 * when asked (#/showcase?cmd=1). Each sits in a box that holds its fixed-position layout.
 */
export default function Showcase() {
  const cmd = window.location.hash.includes('cmd=1')
  return (
    <div className="showcase">
      <div className="sc-desk" />
      <div className="sc-layer">
        <LyricsOverlay />
      </div>
      <div className="sc-layer">
        <Glow />
      </div>
      <div className="sc-mini">
        <MiniPlayer />
      </div>
      {cmd && (
        <div className="sc-cmd">
          <CommandBar />
        </div>
      )}
    </div>
  )
}

import Player from './player/Player'
import Glow from './overlays/Glow'
import LyricsOverlay from './overlays/LyricsOverlay'
import Stage from './widgets/Stage'
import QuickPanel from './player/QuickPanel'
import CommandBar from './player/CommandBar'
import { lazy, Suspense } from 'react'
import MiniPlayer from './player/MiniPlayer'

// the demo video's pretend desktop: only in a build made with VITE_SHOWCASE=1 (make-demo)
const Showcase = import.meta.env.VITE_SHOWCASE === '1' ? lazy(() => import('./Showcase')) : null

const route = window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'player'
document.documentElement.dataset.route = route

export default function App() {
  if (route === 'glow') return <Glow />
  if (route === 'lyrics') return <LyricsOverlay />
  if (route === 'stage') return <Stage />
  if (route === 'quick') return <QuickPanel />
  if (route === 'command') return <CommandBar />
  if (route === 'mini') return <MiniPlayer />
  if (Showcase && route === 'showcase')
    return (
      <Suspense fallback={null}>
        <Showcase />
      </Suspense>
    )
  return <Player />
}

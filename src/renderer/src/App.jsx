import Player from './player/Player'
import Glow from './overlays/Glow'
import LyricsOverlay from './overlays/LyricsOverlay'
import ClockWidget from './widgets/ClockWidget'
import Stage from './widgets/Stage'
import QuickPanel from './player/QuickPanel'

const route = window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'player'
document.documentElement.dataset.route = route

export default function App() {
  if (route === 'glow') return <Glow />
  if (route === 'lyrics') return <LyricsOverlay />
  if (route === 'clock') return <ClockWidget />
  if (route === 'stage') return <Stage />
  if (route === 'quick') return <QuickPanel />
  return <Player />
}

import Player from './player/Player'
import Glow from './overlays/Glow'
import LyricsOverlay from './overlays/LyricsOverlay'
import VizWidget from './widgets/VizWidget'
import ClockWidget from './widgets/ClockWidget'
import Stage from './widgets/Stage'

const route = window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'player'
document.documentElement.dataset.route = route

export default function App() {
  if (route === 'glow') return <Glow />
  if (route === 'lyrics') return <LyricsOverlay />
  if (route === 'widget') return <VizWidget />
  if (route === 'clock') return <ClockWidget />
  if (route === 'stage') return <Stage />
  return <Player />
}

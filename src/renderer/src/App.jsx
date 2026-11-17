import Player from './player/Player'
import Glow from './overlays/Glow'
import LyricsOverlay from './overlays/LyricsOverlay'

const route = window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'player'
document.documentElement.dataset.route = route

export default function App() {
  if (route === 'glow') return <Glow />
  if (route === 'lyrics') return <LyricsOverlay />
  return <Player />
}

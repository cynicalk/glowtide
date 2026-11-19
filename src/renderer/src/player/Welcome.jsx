import { Music2, Youtube, Sparkles, ChevronRight, AudioLines } from 'lucide-react'
import { api } from '../lib/store'

export default function Welcome({ setPanel }) {
  const pick = async (src) => {
    await api.setSource(src)
    if (src === 'youtube') setPanel('library')
  }
  return (
    <div className="connect">
      <div className="hero">
        <div className="orb" />
        <h1>Choose your music</h1>
        <p>Glowtide lights up your screen and shows the lyrics, whichever you use.</p>
      </div>
      <div className="choices">
        <button className="choice" onClick={() => pick('system')}>
          <AudioLines size={22} />
          <div>
            <div className="t">
              Any app <span className="badge">Recommended · no setup</span>
            </div>
            <div className="s">
              Follows what’s playing in Spotify (free or Premium), YouTube Music in your browser,
              Apple Music, TIDAL and more.
            </div>
          </div>
          <ChevronRight size={16} />
        </button>
        <button className="choice" onClick={() => pick('youtube')}>
          <Youtube size={22} />
          <div>
            <div className="t">
              YouTube Music <span className="badge">Free</span>
            </div>
            <div className="s">
              Plays inside Glowtide. Paste any link, or sign in with Google for your playlists and liked
              music.
            </div>
          </div>
          <ChevronRight size={16} />
        </button>
        <button className="choice" onClick={() => pick('spotify')}>
          <Music2 size={22} />
          <div>
            <div className="t">Spotify</div>
            <div className="s">
              Adds Spotify search and your library. Needs your own Spotify developer app, which
              Spotify now limits to Premium accounts and can leave “access pending”. To simply
              follow Spotify, choose Any app.
            </div>
          </div>
          <ChevronRight size={16} />
        </button>
        <button className="choice" onClick={() => pick('demo')}>
          <Sparkles size={22} />
          <div>
            <div className="t">Demo</div>
            <div className="s">Try the glow and lyrics with built-in tracks. No account.</div>
          </div>
          <ChevronRight size={16} />
        </button>
      </div>
      <p className="fine">You can switch any time in Settings or from the tray icon.</p>
    </div>
  )
}

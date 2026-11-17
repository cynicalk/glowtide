# Glowtide for Windows

A music player for Windows that lights the edges of your screen in the colours of the album
cover and puts the song's lyrics on the desktop, word by word. It plays from **YouTube Music
(free)** or **Spotify**.

## Music sources

| | Costs | Playback | Library |
|---|---|---|---|
| **YouTube Music** | Free | YouTube's official embedded player, inside Glowtide | Paste any link with no account. Sign in with Google for your playlists, liked music and search |
| **Spotify Premium** | Premium | Spotify app, controlled from Glowtide | Liked songs, playlists, recent, search, queue, devices |
| **Spotify Free** | Free | Spotify app | Glowtide *follows* what plays: glow, lyrics and colours work, but Spotify doesn't allow remote control |
| **Demo** | Free | Built-in tracks | Preview every style with no account |

Switch sources from the Welcome screen, Settings → Music source, or the tray icon.

## Features

- **Player window**: small, dark and centred, showing the cover (or the video for YouTube).
  It has controls, seek, like (Spotify) and panels for search, library, queue and devices.
- **Edge glow**: one transparent, click-through window per display. Its colour comes from
  the cover, and it pulses on the beat by listening to the PC's sound output (loopback),
  never the microphone. With no audio signal it breathes slowly rather than faking a beat.
- **Kinetic lyrics**: a click-through overlay with the clock and three stacked words. The
  word being sung is large and the next one sits in a highlight block.
- **Colours**: a 5-swatch palette from each cover. Pick which swatch drives the glow, the
  lyrics and the highlight, then adjust brightness and saturation. Dark picks are lifted so
  they stay readable. Or choose Custom. Colours crossfade between songs.
- **Tray**: source, lyrics and glow toggles. Closing the window hides it to the tray.

## Honest limits

- **YouTube**
  - Some videos can't be embedded. Labels often block their official videos, so YouTube shows
    "Video unavailable". Glowtide says so (after about 9 seconds at most) and skips ahead inside a
    playlist. The song's YouTube Music ("Topic") upload often works when the official video
    doesn't.
  - YouTube may show ads.
  - Glowtide pauses YouTube when its window is hidden or minimised, because YouTube's terms don't
    allow playing with the player hidden.
  - The library comes from the official YouTube Data API. It's free, but you create your own
    Google Cloud client (about 5 minutes, in-app steps), and it has a daily quota where each
    search costs 1%.
  - "Liked music" is approximated as your liked videos in YouTube's Music category, because
    the API doesn't expose YouTube Music's own list.
- **Spotify**
  - Controlling playback needs **Premium**.
  - Music plays in the Spotify app, because playing inside Glowtide would need Widevine DRM.
- **Lyrics** come from LRCLIB and are timed by line. Word timing within a line is
  *estimated*. Songs with only untimed lyrics get no overlay. YouTube lyrics are matched by
  title, so a music video with an intro may need the ±0.25 s nudge.
- **No lock screen.** Windows doesn't let apps draw there.

## Setup

**YouTube**
- **No setup needed for links:** choose YouTube Music and paste a link.
- **For your library:**
  1. In Google Cloud, enable **YouTube Data API v3**.
  2. Set the OAuth consent screen to **External**, with yourself as a test user.
  3. Create an OAuth client of type **Desktop app**.
  4. Paste its ID and secret in Library.

**Spotify**
1. Create an app at <https://developer.spotify.com/dashboard> and choose Web API.
2. Add the redirect URI `http://127.0.0.1:43821/callback`.
3. Paste the Client ID and press **Connect Spotify**.

Sign-in uses PKCE in your browser, with no server. Tokens are encrypted with Windows DPAPI
(`safeStorage`) under `%APPDATA%\Glowtide`. Google is asked for read-only YouTube access.

## Develop

```bash
npm install
npm run dev          # hot-reload
npm test             # lyrics, colour and YouTube helper tests
npm run build:win    # installer in dist/
```

PowerShell variables used for debugging:

- `$env:GLOWTIDE_DEMO=1` starts in demo mode. `$env:GLOWTIDE_FRESH=1` resets settings.
- `$env:GLOWTIDE_SNAPSHOT="C:\shots"` writes each window's PNG and `state.json` after
  `GLOWTIDE_SNAPSHOT_MS` (default 6000), then quits. `$env:GLOWTIDE_PANEL="library"` opens a panel.
- `$env:GLOWTIDE_YT_TEST=<videoId>` switches to YouTube and plays that video.
  `$env:GLOWTIDE_DEBUG=1` logs player messages.

## Layout

```
src/shared/    pure logic, unit-tested: LRC parsing, word timing, palette, colour, YouTube titles/links
src/main/      Electron main: OAuth (PKCE), Spotify + YouTube clients, YouTube player host,
               LRCLIB, windows, tray
src/preload/   window.glowtide bridge
src/renderer/  React: #/player, #/glow, #/lyrics
```

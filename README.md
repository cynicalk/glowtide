# Glowtide for Windows

A Spotify player for Windows that lights the edges of your screen in the colours of the
album cover and puts the song's lyrics on the desktop, word by word.

## What's in v0.1

- **Player window**: small, dark and centred. Cover, controls, seek, like, and panels for
  search, library (liked songs, playlists, recent), queue and devices.
- **Edge glow**: one transparent, click-through window per display. Its colour comes from
  the cover, and it pulses on the beat by listening to the PC's sound output (loopback),
  never the microphone. With no audio signal it breathes slowly rather than faking a beat.
- **Kinetic lyrics**: a click-through overlay with the clock and three stacked words. The
  word being sung is large and the next one sits in a highlight block.
- **Colours**: a 5-swatch palette from each cover. Pick which swatch drives the glow, the
  lyrics and the highlight, then adjust brightness and saturation. Dark picks are lifted
  so they stay readable. Or choose Custom to ignore the cover. Colours crossfade between
  songs.
- **Demo mode**: three built-in tracks so every style can be previewed without Spotify.
- **Tray**: lyrics, glow and demo toggles. Closing the window hides it to the tray.

## Honest limits

- **Spotify Premium** is needed to play, pause and skip. Without it Spotify returns
  `PREMIUM_REQUIRED`, which the app shows as is.
- **Music plays in the Spotify app**, not inside Glowtide. Glowtide is a Spotify Connect remote.
  Playing inside Glowtide would need Widevine DRM, which stock Electron does not include.
- **Lyrics are line-timed** (LRCLIB). Word timing within a line is *estimated* from word
  length, and the app says so. Songs with only untimed lyrics get no overlay, because
  inventing timing for a whole song would be worse than showing nothing.
- **No lock screen.** Windows does not let apps draw there, so the overlay is on the desktop.

## Setup

1. Create an app at <https://developer.spotify.com/dashboard> and choose **Web API**.
2. Add the redirect URI `http://127.0.0.1:43821/callback`.
3. Run Glowtide, paste the app's Client ID, and press **Connect Spotify**.

Sign-in uses PKCE in your browser. There is no client secret and no server. Tokens are
encrypted with Windows DPAPI (`safeStorage`) under `%APPDATA%\glowtide`.

## Develop

```bash
npm install
npm run dev          # hot-reload
npm test             # lyrics + colour unit tests
npm run build:win    # installer in dist/
```

PowerShell variables used for debugging:

- `$env:GLOWTIDE_DEMO=1` starts in demo mode.
- `$env:GLOWTIDE_SNAPSHOT="C:\shots"` writes a PNG of each window after
  `GLOWTIDE_SNAPSHOT_MS` (default 6000), then quits.
- `$env:GLOWTIDE_PANEL="settings"` opens that panel first.

## Layout

```
src/shared/    pure logic, unit-tested: LRC parsing, word timing, palette, colour maths
src/main/      Electron main: auth (PKCE), Spotify client, LRCLIB, windows, tray, polling
src/preload/   window.glowtide bridge
src/renderer/  React: #/player, #/glow, #/lyrics
```

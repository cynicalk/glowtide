# Glowtide for Windows

A music companion for Windows that lights the edges of your screen in the colours of the album
cover and puts the song's lyrics on the desktop, word by word. It follows **any music app**
with no setup, or plays **YouTube Music (free)** and controls **Spotify** itself.

## Music sources

| | Costs | Playback | Library |
|---|---|---|---|
| **Any app** (recommended) | Free, no setup | Whatever is playing: Spotify (free or Premium), YouTube Music or YouTube in a browser, Apple Music, TIDAL, foobar2000… | Lives in that app. Glowtide follows it and sends play/pause/skip/seek where the app allows |
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
  word being sung is large and the next one sits in a highlight block. With word-timed
  lyrics, a karaoke fill sweeps across each word over its real duration.
- **Lyrics, best source first**:
  1. [AMLL TTML DB](https://github.com/amll-dev/amll-ttml-db): community word-by-word timing,
     CC0. Matched by Spotify track id when Glowtide knows it, otherwise by title plus a shared
     artist. A title match whose file is a different length is rejected as another version.
  2. LRCLIB enhanced LRC: per-word tags in the file.
  3. LRCLIB line-synced LRC: words spread across each line, labelled as estimated.

  The player says which one is showing ("Word-timed lyrics · AMLL TTML DB" or "word timing
  estimated"), and only measured timing gets the karaoke fill.
- **Colours**: a 5-swatch palette from each cover. Pick which swatch drives the glow, the
  lyrics and the highlight, then adjust brightness and saturation. Dark picks are lifted so
  they stay readable. Or choose Custom. Colours crossfade between songs.
- **Tray**: source, lyrics and glow toggles. Closing the window hides it to the tray.

## Honest limits

- **Any app**
  - Reads Windows' media session, the same info the volume flyout and media keys use, through
    a small Windows PowerShell helper (`resources/smtc.ps1`).
  - It only sees apps that publish a session. Most do; a few (for example some NetEase
    builds) don't.
  - The position is carried forward from the app's last update, so a player that reports
    rarely can drift. Pausing and playing resyncs, and the lyric nudge is still there.
  - Which controls work is up to the app. Glowtide only enables the buttons the app accepts.
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
- **Word-timed lyrics are limited**: the AMLL database has about 3,500 songs, mostly Chinese
  and Japanese, with some Western pop (Taylor Swift, The Weeknd, Sabrina Carpenter…).
  Everything else falls back to LRCLIB, timed by line with words *estimated*. The index
  (~1.7 MB) is downloaded at most once a day. Background vocals and translations in TTML
  files are skipped for now.
- **Lyrics** from LRCLIB are timed by line. Word timing within a line is
  *estimated*. Songs with only untimed lyrics get no overlay. YouTube lyrics are matched by
  title, so a music video with an intro may need the ±0.25 s nudge.
- **No lock screen.** Windows doesn't let apps draw there.

## Setup

**Any app**: nothing to set up. Pick it and play music anywhere. Devices (the speaker icon)
chooses which app to follow when several are playing.

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
  `$env:GLOWTIDE_SYS_TEST=<app id>` follows that app; add `GLOWTIDE_SYS_TEST_CMD="pause"` to send a
  command after 6 s.
  `$env:GLOWTIDE_DEBUG=1` logs player messages.

## Layout

```
src/shared/    pure logic, unit-tested: LRC + enhanced LRC + TTML parsing, AMLL matching,
               word timing, palette, colour,
               YouTube titles/links, media-session app names and track info
src/main/      Electron main: OAuth (PKCE), Spotify + YouTube clients, YouTube player host,
               media-session helper supervisor, LRCLIB, windows, tray
resources/     smtc.ps1: the Windows media-session helper (unpacked from the asar)
src/preload/   window.glowtide bridge
src/renderer/  React: #/player, #/glow, #/lyrics
```

# Glowtide for Windows

A music companion for Windows that lights the edges of your screen in the colours of the album
cover and puts the song's lyrics on the desktop, word by word. It follows **any music app**
with no setup, or plays **YouTube Music (free)** and controls **Spotify** itself.

[![Watch the 30-second demo](docs/demo.jpg)](https://github.com/cynicalk/glowtide-releases/releases/download/v1.0.12/glowtide-demo.mp4)

## Install

1. Download `Glowtide-<version>-setup.exe` from the
   [latest release](https://github.com/cynicalk/glowtide-releases/releases/latest) and run it. It
   installs for your Windows account only (no administrator prompt), starts Glowtide, and adds
   Start menu and desktop shortcuts.
2. The installer isn't code-signed yet, so Windows SmartScreen may say "Windows protected
   your PC". Choose **More info → Run anyway**.
3. Glowtide lives in the tray (by the clock). Closing its window hides it there; quit from the
   tray menu.

Settings, sign-in tokens and `glowtide.log` (errors, if any) are in `%APPDATA%Glowtide`.
Uninstall from Settings → Apps; your settings folder is kept unless you delete it.

**Updates.** From 1.0.3, Glowtide checks the latest release in `cynicalk/glowtide-releases` when it
starts and every six hours, downloads a newer one in the background, and shows **Restart to update** in its title
bar and tray menu. Declined, it installs the next time Glowtide quits. Settings → Updates has
**Check now** and a switch to stop automatic checks. The download is checked against the
SHA-512 in the release's `latest.yml` before it runs.

## Music sources

|                           | Costs          | Playback                                                                                                               | Library                                                                                                |
| ------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Any app** (recommended) | Free, no setup | Whatever is playing: Spotify (free or Premium), YouTube Music or YouTube in a browser, Apple Music, TIDAL, foobar2000… | Lives in that app. Glowtide follows it and sends play/pause/skip/seek where the app allows             |
| **YouTube Music**         | Free           | YouTube's official embedded player, inside Glowtide                                                                    | Paste any link with no account. Sign in with Google for your playlists, liked music and search         |
| **Spotify Premium**       | Premium        | Spotify app, controlled from Glowtide                                                                                  | Liked songs, playlists, recent, search, queue, devices                                                 |
| **Spotify Free**          | Free           | Spotify app                                                                                                            | Glowtide _follows_ what plays: glow, lyrics and colours work, but Spotify doesn't allow remote control |
| **Demo**                  | Free           | Built-in tracks                                                                                                        | Preview every style with no account                                                                    |

Switch sources from the Welcome screen, Settings → Music source, or the tray icon.

## Features

- **Full screen** (Ctrl+Alt+F): the cover blurred and drifting as the room light, a sharp
  copy in the middle with the visualizer orbiting it, and a ripple on every bass hit.
  Six visualizer styles (Bars, Mirror, Blocks, Ring, Waveform, Aurora). Space, the arrows,
  V (visualizer), C (colours) and Esc work. It caps its frame rate (30/60) and drops to
  20 fps when nothing is playing.
- **Light on the computer**: the edge glow and the lyrics draw at 30 fps by default (60 is an option in Settings → Lyrics overlay). Everything that moves continuously is moved by the GPU compositor rather than repainted, and the overlay stops all work while it is hidden. Paused, Glowtide uses almost nothing.
- **Maximise**: the title-bar button or a double-click gives a roomy full-window player; F11 goes full screen.
- **Player window**: three parts. On the left, where you go: Now playing, Library, Search,
  Queue, Devices (or Apps) and Settings, as icons in a narrow window and with their names
  when wide; each opens as a page in the middle. In the middle, the round cover (or the
  video for YouTube), seek and the controls, with back 15 s, like (Spotify) and forward
  15 s grouped beneath. On the right, what you see: lyrics in the window (beside the cover
  when wide, above the controls when narrow), lyrics on the desktop, the edge glow (a click
  turns it on or off; resting on it opens every glow choice), the cover filling the window,
  and full screen. Every button has a short description on hover (Settings → App → Button
  hints turns them off). Rest the pointer on the cover and it grows while the window takes
  on its colour; click it to fill the window. **Sync** opens into − / + (50 ms a click) to nudge lyric
  timing.
- **Settings** is a page with tabs: Glow, Lyrics, Colours, Full screen and App.
- **Command bar** (Ctrl+Alt+G): type a song (Spotify as you type, YouTube Music on Enter) or a
  command: next, pause, shuffle, repeat, like, volume 40, seek 1:30, device, share, lyrics,
  glow, full screen, mini. "queue …" adds a song to the queue.
- **Shortcuts**: Settings → App → Shortcuts records a global shortcut for the command bar,
  desktop lyrics, full screen, play/pause, next, previous, like and the mini player (ones another
  app already holds are flagged). In the player: Space, Ctrl+← →, Shift+← → (15 s), [ ] (lyrics
  50 ms earlier/later, Shift for 0.5 s) and L (like).
- **Mini player**: a slim player above the taskbar by the clock (cover, song, previous / play /
  next, and optionally like, shuffle and repeat). It never takes focus, and hides while nothing
  plays or a full-screen app covers it.
- **Share**: copies "Song — Artist" and a Spotify or YouTube Music link (the dock, the tray menu,
  or "share" in the command bar).
- **Stats**: time listened each day (or month), your top songs and artists for the week,
  month, year or all time, and a "My week in music" card to copy or save. A song counts
  after 30 seconds of listening, from any source but the demo. The history stays on your
  PC (`history.jsonl` in the settings folder); turn it off or clear it on the Stats page.
  On Sunday evening a **weekly recap** notification shows your week (time listened, top
  song); click it for Stats and the card.
- **Phone remote** (Settings → App): play, pause, skip, seek, volume and the lyric line on
  your phone, on the same Wi-Fi. Open the address Glowtide shows (port 43823) and pair with
  a six-digit code; only paired phones get in, and "Forget" revokes them. Windows asks once
  whether Glowtide may use the network: allow private networks.
- **Quieter during calls** (Settings → App): while Discord, Teams, Zoom, WhatsApp, Slack or
  a browser call uses your microphone, the music goes down (to 30% by default) and comes
  back after. An app followed by "Any app" is turned down in the Windows volume mixer; if
  the call is in the same browser as the music, the music pauses instead.
- **Glow by time of day** (Settings → Glow): true to the cover by day, easing warmer and up
  to 40% dimmer from 6 pm, back by 8 am.
- **Backgrounds** (Settings → Colours → Background): the blurred cover, flowing colours (soft blobs
  of the cover's colours drifting slowly), or your own picture or video (MP4/WebM, silent and
  looping, like a live wallpaper), behind the player and optionally the full-screen view. The
  file is copied into the settings folder; a video pauses while it can't be seen.
- **Your own lyric colours** (sung, others, highlight) and **line spacing**; the desktop lyrics
  can also sit on flowing colours.
- **Time each word**: on line-timed lyrics (or after tap-to-sync), tap as each word starts for
  karaoke-grade timing; finished lines are saved word by word, the rest keep their line time.
- **Share to LRCLIB**: lyrics you timed can be published to [LRCLIB](https://lrclib.net) for
  everyone, after a confirmation that shows exactly what is sent (title, artist, album, length,
  the words and line times). It's public and permanent; demo songs are never offered.
- **Share a line**: an image for stories (1080×1920) or a square post, with the cover, a line you
  pick and the song; copy it or save it as a PNG.
- **Wrong lyrics?** under the lyrics view lists LRCLIB's versions of the song (timed first,
  closest in length), or of what you search; your pick is remembered per song.
- A short **first-run tour** after you pick a music source.
- **Edge glow**: one transparent, click-through window per display (all, the main one, or
  one you pick). Its colours come from the cover: **1 colour**, or **2 colours** sharing the
  edge by a split you set and blending where they meet. **Animation**: Default (the light
  travels round at a steady pace), Music Sync (faster and swelling on the beat, from the
  PC's sound output, never the microphone), Idle (a slow drift and breathe) or No Animation.
  **Keep clear of the taskbar** (on by default) runs it along the top of the taskbar
  instead of behind it.
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

- **Time lyrics yourself** (tap-to-sync): when a song's lyrics have no timing, **Time these
  lyrics** under the lyrics view lets you play the song and tap (Space, Enter or a click) as
  each line starts; Backspace undoes, Esc leaves. Saved on this PC per song (artist and title,
  so it works from any source), it comes first from then on and the desktop overlay can show
  it. **Re-time**, **Export .lrc** and **Remove** sit under songs you've timed.
- **Lyric styles**:
  - **Stack**: the word or line big in the middle.
  - **Aura**: the lyric over a soft, drifting cloud of the cover's colours.
  - **Waves**: the whole line rides a ripple, sung words light up, flowing lines behind.
  - **Beat**: the word pulses and a ring ripples out on every beat (system audio,
    never the microphone; a slow breathe when there is no sound).
  - **Karaoke**: the line with a colour sweep across each word, a 3-2-1 count-in
    after a long gap, and the next line waiting below.
  - **Constellation**: the words build a real constellation. Each sung word brings in its
    own star, sitting beside it, and the line to it draws itself from the star before.
    When the verse ends the figure completes with a shooting star, and the next verse
    fades in a new constellation. Well-known
    figures that fit the verse come first (Orion, the Big Dipper, Cassiopeia, the zodiac…),
    and a chorus returns to its own constellation each time. Stars have their real
    brightness and colour (orange Betelgeuse, blue-white Rigel), under a faint Milky Way,
    and pulse with the music. All 88 are included, drawn from real sky coordinates, with
    the name, meaning and a short note in the corner and the whole line as a caption.
- **Overlay options**:
  - Backdrop: none, dim, or blurred album art with film grain.
  - Serif or sans clock, and 12 Windows fonts.
  - Which display the overlay uses.
  - Keep the screen awake while music plays.
  - The overlay steps aside while Glowtide's own window is in use. Ctrl+Alt+L toggles it.
- **Full-screen apps**: while a game, a full-screen video or a presentation fills a display,
  the glow and the lyrics on that display hide and stop drawing, then
  come back when it closes. A small helper (`resources/fullscreen.ps1`) looks at the window in
  front once a second. Settings → Lyrics overlay → Hide for full-screen apps turns it off.
- **Colours**: a 5-swatch palette from each cover. Pick which swatch drives the glow, the
  lyrics and the highlight, then adjust brightness and saturation. Dark picks are lifted so
  they stay readable. Or **Override** the album: two colour wheels (primary and secondary,
  each with a brightness slider). Colours crossfade between songs.
- **Tray**: click the icon for quick settings beside it (gradient, animation, taskbar,
  thickness, glow, override colours, display, desktop lyrics, taskbar button, updates, open
  and quit); double-click for the player; right-click for the menu. Closing the window hides
  it to the tray. **Show in taskbar** off keeps Glowtide in the tray only. Hovering the taskbar
  button shows previous, play/pause and next under the preview.
- **Start with Windows** (Settings → App, on by default in installed copies): Glowtide starts in
  the tray when you sign in, with the glow and lyrics ready and the window closed.

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
  - Since March 2026, apps made in Spotify's developer dashboard (which is how you connect) get
    at most 10 search results per type, and can list the songs only of playlists you made or
    collaborate on. Other playlists (Spotify's own mixes included) still play from **Play**.
  - Music plays in the Spotify app, because playing inside Glowtide would need Widevine DRM.
- **Word-timed lyrics are limited**: the AMLL database has about 3,500 songs, mostly Chinese
  and Japanese, with some Western pop (Taylor Swift, The Weeknd, Sabrina Carpenter…).
  Everything else falls back to LRCLIB, timed by line with words _estimated_. The index
  (~1.7 MB) is downloaded at most once a day. Background vocals and translations in TTML
  files are skipped for now.
- **Lyrics** from LRCLIB are timed by line. Word timing within a line is
  _estimated_. Songs with only untimed lyrics get no overlay; the player shows the
  text to read along, scrolling with the song (a guess from how far in it is, labelled so). YouTube lyrics are matched by
  title, so a music video with an intro may need the ±0.25 s nudge.
- **No lock screen.** Windows doesn't let apps draw there.

## Setup

**Any app**: nothing to set up. Pick it and play music anywhere. Devices (the speaker icon)
chooses which app to follow when several are playing.

**YouTube**

- **No setup needed for links:** choose YouTube Music and paste a link.
- **For your library:**
  1. In Google Cloud, enable **YouTube Data API v3**.
  2. Under Google Auth Platform (the OAuth consent screen), choose **External**, and in
     **Audience → Test users** add the Gmail you sign in with. Without it Google blocks the
     sign-in: the app "can only be accessed by developer-approved testers".
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
npm run build:win    # lint + tests + build, then the installer in dist/
npm run build:icon   # re-render build/icon.ico and the tray icon from scripts/build-icon.mjs
```

To release: `npm run build:win`, then attach `Glowtide-<version>-setup.exe`, its `.blockmap` and
`latest.yml` from `dist/` to a release in the public `cynicalk/glowtide-releases` repository
(not a draft or pre-release).
This source repository is private, so installed copies can't read its releases. They update from whichever full release is marked latest; without `latest.yml` they
can't see it.

The installer is unsigned, so Windows SmartScreen shows "Unknown publisher" the first time
it runs (More info → Run anyway).

PowerShell variables used for debugging. They work only in a development run (`npm run dev`
or `npx electron .` after `npm run build`); a packaged copy ignores every one of them.

- `$env:GLOWTIDE_PROFILE="C:somewhere"` uses a separate settings folder, so a test run never
  touches your real settings or closes the Glowtide you have open.

- `$env:GLOWTIDE_DEMO=1` starts in demo mode. `$env:GLOWTIDE_FRESH=1` resets settings.
- `$env:GLOWTIDE_SNAPSHOT="C:\shots"` writes each window's PNG and `state.json` after
  `GLOWTIDE_SNAPSHOT_MS` (default 6000), then quits. `$env:GLOWTIDE_PANEL="library"` opens a panel.
- `$env:GLOWTIDE_YT_TEST=<videoId>` switches to YouTube and plays that video.
  `$env:GLOWTIDE_SYS_TEST=<app id>` follows that app; add `GLOWTIDE_SYS_TEST_CMD="pause"` to send a
  command after 6 s.
  `$env:GLOWTIDE_DEBUG=1` logs player messages.
- `$env:GLOWTIDE_AUDIT=1` (with `GLOWTIDE_SNAPSHOT`, `GLOWTIDE_DEMO` and `GLOWTIDE_UNFOCUS`) clicks every
  button and changes every setting in the running app, checks each has its effect, writes
  `audit.json` and quits.
- `$env:GLOWTIDE_FS_TEST=1` (with `GLOWTIDE_SNAPSHOT`) logs, for 40 s, whether each overlay and
  widget is showing and the CPU of each window, into `fs.json`.
- With `GLOWTIDE_SNAPSHOT`: `$env:GLOWTIDE_QUICK=1` opens the tray panel (and photographs it),
  `$env:GLOWTIDE_PLAYER_SIZE="1100,720"` sizes the player, `$env:GLOWTIDE_PLAYER_JS` runs in the player
  at 2.5 s, and `$env:GLOWTIDE_HOVER="<selector>"` rests the pointer on that element of the player
  (or the tray panel, with `GLOWTIDE_HOVER_IN=quick`) so hover states show. `state.json` also
  records each glow window's bounds.
- **The demo video**: `$env:VITE_SHOWCASE=1; npx electron-vite build`, then a run with
  `GLOWTIDE_RECORD=1`, `GLOWTIDE_DEMO=1`, `GLOWTIDE_PROFILE` and `GLOWTIDE_SNAPSHOT=<folder>` draws
  six scenes offscreen into `<folder>/frames` (nothing appears on screen), and
  `npx electron scripts/make-demo.cjs <folder> demo.mp4` adds captions and a soundtrack written in
  code (no third-party music). Build again without `VITE_SHOWCASE` afterwards: only that build
  contains the demo's pretend desktop.
- `$env:GLOWTIDE_COMMAND=1` (with `GLOWTIDE_SNAPSHOT`) opens the command bar and keeps it open to
  photograph it; `GLOWTIDE_PROBE_IN` also takes `command` and `mini`.
- `$env:GLOWTIDE_PLAIN_TEST=1` (with `GLOWTIDE_DEMO`) serves the demo's lyrics untimed, to see the
  read-along view.
- `$env:GLOWTIDE_PROBE_JS="<js>"` (with `GLOWTIDE_SNAPSHOT`) runs in the lyrics overlay, or in the
  window `GLOWTIDE_PROBE_IN` names (`player`, `stage`), at `GLOWTIDE_PROBE_AT` ms (default 3000), and
  writes what it returns, awaited if it's a promise, to `probe.json`.
- `$env:GLOWTIDE_UPDATE_FEED="http://127.0.0.1:8899/"` updates a development run from a local
  folder of `latest.yml` and an installer (needs a `dev-app-update.yml` in the project);
  add `GLOWTIDE_UPDATE_INSTALL=1` to install as soon as it has downloaded.

## Layout

```
src/shared/    pure logic, unit-tested: LRC + enhanced LRC + TTML parsing, AMLL matching,
               word timing, palette, colour,
               YouTube titles/links, media-session app names and track info
src/main/      Electron main: OAuth (PKCE), Spotify + YouTube clients, YouTube player host,
               media-session helper supervisor, LRCLIB, windows, tray
scripts/       build-sky.mjs: regenerates src/shared/skyData.mjs from d3-celestial;
               build-icon.mjs: renders the app icon
resources/     smtc.ps1: the Windows media-session helper; fullscreen.ps1: spots full-screen
               apps (both unpacked from the asar)
src/preload/   window.glowtide bridge
src/renderer/  React: #/player, #/glow, #/lyrics
```

## Licence

[MIT](LICENSE). Third-party code and data keep their own licences
([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

Lyrics are fetched while a song plays, from LRCLIB and the AMLL TTML DB, and kept only in
memory or in your own settings folder (lyrics you time yourself). None are stored in this
repository; they belong to their songwriters and publishers. Spotify, YouTube and YouTube
Music are trademarks of their owners, and Glowtide is not affiliated with them.

## Credits

Constellation figures: [d3-celestial](https://github.com/ofrohn/d3-celestial) © 2015 Olaf
Frohn (BSD 3-Clause). Word-timed lyrics: [AMLL TTML DB](https://github.com/amll-dev/amll-ttml-db)
(CC0). Synced lyrics: [LRCLIB](https://lrclib.net). See THIRD_PARTY_NOTICES.md.

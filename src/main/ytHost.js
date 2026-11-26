// Where Glowtide's YouTube player runs: YouTube's official IFrame player, on a small page
// published with GitHub Pages (its source is player-page/ in this repository). The player
// window frames it and talks to it with postMessage.
//
// Why a public page: YouTube's player won't play most music on a page served from the PC
// itself (it did once, from http://127.0.0.1); on a real website it plays as anywhere else.
// Every copy of Glowtide uses this one page, so its messages must stay compatible.
//
// The video stays visible in the player window. YouTube's terms forbid hiding the player or
// separating the audio, so Glowtide pauses YouTube when the window is hidden.

import { app } from 'electron'

export const YT_HOST_ORIGIN = 'https://cynicalk.github.io'
// the app's version in the address, so each version gets the page fresh rather than cached
export const YT_PAGE_URL = `${YT_HOST_ORIGIN}/glowtide-player/?app=${app.getVersion()}`

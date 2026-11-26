# Glowtide player page

The page Glowtide's YouTube player runs in: YouTube's official IFrame player, driven by the
Glowtide window that frames it. It's published at https://cynicalk.github.io/glowtide-player/
because YouTube won't play most music in a player on a page served from the PC itself.

The source lives here, in Glowtide's repository; `cynicalk/glowtide-player` holds a copy of
these files for GitHub Pages. Change them here, then copy `index.html` and `player.js` there. Bump the `?v=` on
`player.js` in `index.html` with every change, so no one is left with a cached copy.
Every copy of Glowtide uses the published page, so keep its messages compatible.

It takes commands only from the window that frames it, checks each one, keeps nothing and sends
nothing anywhere else.

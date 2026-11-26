// YouTube searches without the official API (see shared/innertube.mjs): YouTube's own video
// search (the main one) and YouTube Music's (the last fallback). No sign-in, no quota.
// One fixed address, a time limit and a size limit; what comes back is only read for
// songs' ids, titles and artists, never run.

import {
  parseMusicSearch,
  parseVideoSearch,
  searchBody,
  videoSearchBody
} from '../shared/innertube.mjs'
import { parseYouTubeTitle } from '../shared/youtube.mjs'

const URL_SEARCH = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false'
const URL_VIDEO_SEARCH = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'
const WEB_VERSION = '2.20241106.01.00'
// The website's client version: YouTube accepts older ones for a long while; if a search is
// refused, this is what wants bringing up to date.
const CLIENT_VERSION = '1.20241106.01.00'
const MAX_BYTES = 4 * 1024 * 1024

async function ask(url, body, origin, fetcher) {
  let res
  try {
    res = await fetcher(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Referer: `${origin}/`
      },
      body: JSON.stringify(body)
    })
  } catch {
    throw new Error("Couldn't reach YouTube Music to search.")
  }
  if (!res.ok) throw new Error(`YouTube Music didn't answer the search (${res.status}).`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error('YouTube Music sent back too much.')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error("YouTube Music's answer couldn't be read.")
  }
}

/** Songs for a search, in the official search's shape; throws a message to show if it can't. */
export async function searchMusic(query, { fetcher = fetch } = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []
  const json = await ask(
    URL_SEARCH,
    searchBody(q, CLIENT_VERSION),
    'https://music.youtube.com',
    fetcher
  )
  return parseMusicSearch(json)
}

/**
 * YouTube's own video search (official videos, lyric and audio uploads): the main search, as
 * more of what it finds plays in an embedded player than YouTube Music's song versions.
 */
export async function searchVideos(query, { fetcher = fetch } = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []
  const json = await ask(
    URL_VIDEO_SEARCH,
    videoSearchBody(q, WEB_VERSION),
    'https://www.youtube.com',
    fetcher
  )
  return parseVideoSearch(json, parseYouTubeTitle)
}

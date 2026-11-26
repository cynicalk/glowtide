// The backup YouTube search (see shared/innertube.mjs): YouTube Music's own search, when
// Google isn't signed in, or the official API fails (its daily quota used up, say).
// One fixed address, a time limit and a size limit; what comes back is only read for
// songs' ids, titles and artists, never run.

import { parseMusicSearch, searchBody } from '../shared/innertube.mjs'

const URL_SEARCH = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false'
// The website's client version: YouTube accepts older ones for a long while; if a search is
// refused, this is what wants bringing up to date.
const CLIENT_VERSION = '1.20241106.01.00'
const MAX_BYTES = 4 * 1024 * 1024

/** Songs for a search, in the official search's shape; throws a message to show if it can't. */
export async function searchMusic(query, { fetcher = fetch } = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []
  let res
  try {
    res = await fetcher(URL_SEARCH, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/'
      },
      body: JSON.stringify(searchBody(q, CLIENT_VERSION))
    })
  } catch {
    throw new Error("Couldn't reach YouTube Music to search.")
  }
  if (!res.ok) throw new Error(`YouTube Music didn't answer the search (${res.status}).`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error('YouTube Music sent back too much.')
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("YouTube Music's answer couldn't be read.")
  }
  return parseMusicSearch(json)
}

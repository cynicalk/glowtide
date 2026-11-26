// Back up and move your setup: one file with your settings, the lyrics you timed, the lyric
// versions you picked, your per-song nudges and your listening history. Pure: the files are
// read and written in main.
//
// A backup is a file anyone could hand you, so reading one trusts nothing in it: every part
// is checked, capped and reduced to the shapes Glowtide keeps, and the settings go through
// the same merge as any settings change (known keys, right types, capped strings) after.

export const BACKUP_KIND = 'glowtide-backup'
const MAX_SONGS = 2000
const MAX_PLAYS = 60000
const MAX_LRC = 200000

// Never in a backup: anything to do with signing in (the Spotify and Google app IDs and the
// secret, so a backup someone hands you can't point your sign-ins at their app), and what
// only makes sense on this PC.
const LEAVE_OUT = ['clientId', 'googleClientId', 'googleClientSecret', 'recapLast', 'yearLast']

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const keyOk = (k) => typeof k === 'string' && k.length > 1 && k.length < 400 && k.includes('|')

/** The backup's content (stringify it to save). */
export function makeBackup({
  version,
  now = Date.now(),
  settings,
  myLyrics,
  choices,
  offsets,
  plays,
  favs,
  ytLibrary
}) {
  const s = { ...(settings || {}) }
  for (const k of LEAVE_OUT) delete s[k]
  // the phone remote's paired phones aren't in settings; a remote that was on stays off until
  // you turn it on again on the new PC (and pair phones there)
  if (isObj(s.remote)) s.remote = { ...s.remote, enabled: false }
  // your own background picture or video stays on this PC: back to the cover there
  if (isObj(s.background) && s.background.kind !== 'cover' && s.background.kind !== 'flow')
    s.background = { ...s.background, kind: 'cover', file: '' }
  return {
    kind: BACKUP_KIND,
    format: 1,
    app: version || '',
    created: new Date(now).toISOString(),
    settings: s,
    myLyrics: myLyrics || {},
    choices: choices || {},
    offsets: offsets || {},
    plays: plays || [],
    favs: favs || [],
    ytLibrary: ytLibrary || { liked: [], lists: [], recent: [] }
  }
}

/** A picture a starred line may carry: an https address or a small inline image. */
const coverOk = (c) =>
  typeof c === 'string' &&
  ((/^https:\/\//.test(c) && c.length < 1000) ||
    (/^data:image\/(png|jpe?g|webp);base64,/.test(c) && c.length < 200000))

/**
 * The parts of a backup Glowtide can take, checked; { error } when it isn't a backup.
 * Returns { created, app, settings, myLyrics, choices, offsets, plays, counts }.
 */
export function readBackup(raw) {
  let b
  try {
    b = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return { error: 'That file isn’t a Glowtide backup.' }
  }
  if (!isObj(b) || b.kind !== BACKUP_KIND || b.format !== 1)
    return { error: 'That file isn’t a Glowtide backup.' }

  const settings = isObj(b.settings) ? { ...b.settings } : {}
  for (const k of LEAVE_OUT) delete settings[k]

  const myLyrics = {}
  if (isObj(b.myLyrics))
    for (const [k, v] of Object.entries(b.myLyrics).slice(-MAX_SONGS))
      if (keyOk(k) && isObj(v) && typeof v.lrc === 'string' && v.lrc.length < MAX_LRC)
        myLyrics[k] = {
          lrc: v.lrc,
          saved: typeof v.saved === 'string' ? v.saved.slice(0, 40) : new Date().toISOString()
        }

  const choices = {}
  if (isObj(b.choices))
    for (const [k, v] of Object.entries(b.choices).slice(-MAX_SONGS))
      if (keyOk(k) && Number.isInteger(v) && v > 0) choices[k] = v

  const offsets = {}
  if (isObj(b.offsets))
    for (const [k, v] of Object.entries(b.offsets).slice(-MAX_SONGS))
      if (keyOk(k) && Number.isFinite(v) && Math.abs(v) <= 60000) offsets[k] = Math.round(v)

  const plays = []
  if (Array.isArray(b.plays))
    for (const p of b.plays.slice(-MAX_PLAYS)) {
      if (!isObj(p) || !Number.isFinite(p.at) || !Number.isFinite(p.ms)) continue
      if (typeof p.title !== 'string' || !p.title.trim()) continue
      if (p.at < Date.UTC(2020, 0, 1) || p.ms < 0 || p.ms > 6 * 3600000) continue
      plays.push({
        at: Math.round(p.at),
        ms: Math.round(p.ms),
        title: p.title.slice(0, 300),
        artist: typeof p.artist === 'string' ? p.artist.slice(0, 300) : '',
        album: typeof p.album === 'string' ? p.album.slice(0, 300) : '',
        source: ['system', 'spotify', 'youtube'].includes(p.source) ? p.source : 'system'
      })
    }

  const favs = []
  if (Array.isArray(b.favs))
    for (const f of b.favs.slice(0, 500)) {
      if (!isObj(f) || !keyOk(f.key) || typeof f.text !== 'string' || !f.text.trim()) continue
      favs.push({
        key: f.key,
        text: f.text.trim().slice(0, 300),
        title: typeof f.title === 'string' ? f.title.slice(0, 200) : '',
        artist: typeof f.artist === 'string' ? f.artist.slice(0, 200) : '',
        cover: coverOk(f.cover) ? f.cover : null,
        at: Number.isFinite(f.at) ? Math.round(f.at) : Date.now()
      })
    }

  // the YouTube library: each song and list is checked again as it's added (ytLibrary.merge)
  const yl = isObj(b.ytLibrary) ? b.ytLibrary : {}
  const ytLibrary = {
    liked: Array.isArray(yl.liked) ? yl.liked.slice(0, 2000) : [],
    lists: Array.isArray(yl.lists) ? yl.lists.slice(0, 300) : [],
    recent: Array.isArray(yl.recent) ? yl.recent.slice(0, 50) : []
  }

  return {
    created: typeof b.created === 'string' ? b.created.slice(0, 40) : '',
    app: typeof b.app === 'string' ? b.app.slice(0, 20) : '',
    settings,
    myLyrics,
    choices,
    offsets,
    plays,
    favs,
    ytLibrary,
    counts: {
      lyrics: Object.keys(myLyrics).length,
      choices: Object.keys(choices).length,
      offsets: Object.keys(offsets).length,
      plays: plays.length,
      favs: favs.length,
      ytLiked: ytLibrary.liked.length
    }
  }
}

/** Your history with the backup's plays added, without doubles, oldest first. */
export function mergePlays(mine, theirs) {
  const seen = new Set(mine.map((p) => `${p.at}|${p.title}`))
  const out = [...mine]
  for (const p of theirs) {
    const k = `${p.at}|${p.title}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(p)
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(-MAX_PLAYS)
}

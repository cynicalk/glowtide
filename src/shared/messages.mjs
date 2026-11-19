// Messages lyric style: the song as a text conversation. Each sung line is a message; the
// singer and "you" take turns verse by verse, the way two people text back and forth.
// A typing bubble shows just before a line arrives, lines pick up an emoji from their
// words, and now and then the other side reacts to a message with a tapback.
// Pure: no DOM.

const SECTION_GAP_MS = 5000 // a pause this long starts a new verse, and the turn passes
const TYPING_MS = 1600 // the typing bubble shows this long before a line arrives
const TYPING_MIN_GAP_MS = 350 // ...but not if the previous line arrived only just now
export const VISIBLE = 8 // messages kept on screen; older ones have scrolled away

// The first group that matches decides the emoji. Stems match the start of a word, so
// "love" also catches "lovers" and "loving".
const EMOJI = [
  [['heartbreak', 'heartbroke', 'broken', 'goodbye'], '💔'],
  [['love', 'lover', 'heart'], '❤️'],
  [['kiss'], '😘'],
  [['cry', 'cried', 'tears', 'tear'], '😢'],
  [['sad', 'blue'], '😔'],
  [['lonely', 'alone'], '🥀'],
  [['laugh', 'funny', 'lol'], '😂'],
  [['smile', 'happy'], '😊'],
  [['fire', 'burn', 'flame', 'hot'], '🔥'],
  [['night', 'moon', 'midnight'], '🌙'],
  [['star', 'shine', 'shining', 'glow', 'gold'], '✨'],
  [['sun', 'summer'], '☀️'],
  [['rain', 'storm'], '🌧️'],
  [['ocean', 'sea', 'wave', 'water'], '🌊'],
  [['sky', 'heaven'], '🌌'],
  [['dance', 'dancing'], '💃'],
  [['party', 'celebrate'], '🎉'],
  [['money', 'cash', 'rich', 'pay'], '💸'],
  [['drink', 'wine', 'drunk', 'whiskey'], '🍷'],
  [['phone', 'call', 'text'], '📱'],
  [['drive', 'car', 'ride'], '🚗'],
  [['home'], '🏠'],
  [['dream', 'sleep'], '💭'],
  [['time', 'forever', 'wait'], '⏳'],
  [['world', 'earth'], '🌍'],
  [['flower', 'rose', 'bloom'], '🌹'],
  [['song', 'sing', 'music', 'melody'], '🎶'],
  [['pray', 'god', 'angel'], '🙏'],
  [['dead', 'die', 'kill', 'ghost'], '💀'],
  [['crazy', 'insane', 'wild'], '🤪'],
  [['cold', 'ice', 'freeze', 'frozen'], '🥶'],
  [['diamond', 'earring', 'ring'], '💎'],
  [['eye', 'look', 'see', 'watch'], '👀'],
  [['sorry', 'please', 'miss'], '🥺'],
  [['fly', 'free', 'wings'], '🕊️'],
  [['run', 'running', 'away'], '🏃'],
  [['light', 'lights', 'bright'], '💡']
]

/**
 * The emoji a line picks up from its words, or null. The list is in order of meaning, so a
 * stronger word wins wherever it sits: "my heart is broken" is a broken heart.
 */
export function emojiFor(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean)
  // short stems ("sun", "sea", "car") only match the whole word, not "sunday" or "card"
  const hit = (s) => words.some((w) => w === s || (s.length >= 4 && w.startsWith(s)))
  for (const [stems, e] of EMOJI) if (stems.some(hit)) return e
  return null
}

// Tapbacks are the six iMessage reactions; a message's own emoji suggests which one.
const TAPBACK = {
  '😂': '😂',
  '🤪': '😂',
  '🔥': '‼️',
  '💸': '‼️',
  '💀': '‼️',
  '🎉': '‼️',
  '✨': '‼️'
}
function hash(n) {
  let t = (n + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return (t ^ (t >>> 14)) >>> 0
}

/**
 * The whole conversation for a song: [{ i, text, emoji, t, from, reaction, reactAt }].
 * i is the line's index; from is 'them' (the singer, first) or 'me', swapping each verse.
 * reaction: a tapback the other side puts on this message once they reply (at reactAt,
 * the index in this list of their reply).
 */
export function buildThread(lines, seed = 0) {
  const out = []
  let section = 0
  let lastEnd = null
  ;(lines || []).forEach((l, i) => {
    const text = String(l?.text || '').trim()
    if (!text) {
      if (lastEnd !== null) section++ // a break marker in the file
      lastEnd = null
      return
    }
    if (lastEnd !== null && l.t - lastEnd > SECTION_GAP_MS) section++
    const emoji = emojiFor(text)
    out.push({ i, text, emoji, t: l.t, from: section % 2 ? 'me' : 'them', reaction: null })
    lastEnd = l.end ?? l.t
  })
  // The last message before the other side takes over sometimes gets a reaction.
  for (let k = 0; k + 1 < out.length; k++) {
    if (out[k].from === out[k + 1].from) continue
    const h = hash(seed + k * 7919)
    if (h % 3) continue
    out[k].reaction = TAPBACK[out[k].emoji] || (h % 2 ? '❤️' : '‼️')
    out[k].reactAt = k + 1
  }
  return out
}

/**
 * The conversation at posMs: the last VISIBLE messages, who is typing, and how far it has
 * got. Returns { messages, typing: 'them' | 'me' | null, index, first, key }.
 * index: how many messages have arrived, minus one (-1 before the first).
 */
export function messagesAt(thread, posMs) {
  let idx = -1
  for (let k = 0; k < thread.length; k++) {
    if (thread[k].t <= posMs) idx = k
    else break
  }
  const next = thread[idx + 1]
  const sinceLast = idx >= 0 ? posMs - thread[idx].t : Infinity
  const typing =
    next && next.t - posMs <= TYPING_MS && sinceLast >= TYPING_MIN_GAP_MS ? next.from : null
  const from = Math.max(0, idx - VISIBLE + 1)
  const messages = thread.slice(from, idx + 1).map((m, j) => ({
    ...m,
    reaction: m.reaction && idx >= m.reactAt ? m.reaction : null,
    // the last of a run from one sender carries the bubble's tail
    tail: j === idx - from ? typing !== m.from : thread[from + j + 1]?.from !== m.from
  }))
  return { messages, typing, index: idx, first: from === 0, key: `${idx}|${typing}` }
}

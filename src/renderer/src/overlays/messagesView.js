import { buildThread, messagesAt } from '../../../shared/messages.mjs'

// The conversation is built once per song, not every frame.
let threadCache = { lines: null, seed: null, thread: [] }

/** For useLyricView: the conversation at pos (it re-renders only when the key changes). */
export function messagesView(lines, pos, { seed }) {
  if (threadCache.lines !== lines || threadCache.seed !== seed)
    threadCache = { lines, seed, thread: buildThread(lines, seed) }
  return { ...messagesAt(threadCache.thread, pos), chat: true }
}

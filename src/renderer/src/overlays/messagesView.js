import { buildThread, messagesAt } from '../../../shared/messages.mjs'

// The song's messages are worked out once per song, not every frame.
let threadCache = { lines: null, thread: [] }

/** The messages at pos (the overlay and the player re-render only when the key changes). */
export function messagesView(lines, pos) {
  if (threadCache.lines !== lines) threadCache = { lines, thread: buildThread(lines) }
  return { ...messagesAt(threadCache.thread, pos), chat: true }
}

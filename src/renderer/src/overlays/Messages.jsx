/**
 * Messages: the lyrics arrive as text messages floating over the screen. The singer's are
 * frosted glass on the left, "yours" on the right in the album's highlight colour, taking
 * turns verse by verse. Typing dots come first, each message glides up into place, and the
 * oldest fade away at the top. Words pick up an emoji; now and then one gets a reaction.
 */
export function Messages({ view }) {
  if (!view) return null
  const { messages, typing } = view
  return (
    <div className="msg-float" aria-hidden="true">
      {messages.map((m) => (
        <div key={m.i} className={`msg ${m.from} ${m.reaction ? 'reacted' : ''}`}>
          <div className="bubble">
            {m.emoji ? `${m.text} ${m.emoji}` : m.text}
            {m.reaction && <span className={`tapback ${m.from}`}>{m.reaction}</span>}
          </div>
        </div>
      ))}
      {typing && (
        <div key={`typing-${view.index}`} className={`msg ${typing} typing`}>
          <div className="bubble">
            <i />
            <i />
            <i />
          </div>
        </div>
      )}
    </div>
  )
}

// The edge glow's choices as the player, the settings panel and the tray panel show them.

export const GRADIENTS = [
  [1, '1 colour'],
  [2, '2 colours']
]

export const ANIMATION_OPTIONS = [
  ['default', 'Default'],
  ['music', 'Music Sync'],
  ['idle', 'Idle'],
  ['none', 'No Animation']
]

export const ANIMATION_HINTS = {
  default: 'The light travels round the edge at a steady pace.',
  music:
    'Travels faster and swells with the beat. Listens to this PC’s sound output, never the microphone.',
  idle: 'A slow drift and a gentle breathe, the same whether the music is loud or quiet.',
  none: 'The glow holds still.'
}

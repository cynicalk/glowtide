// Time in words, the way people say it: "quarter past ten", "twenty-five to six".

const NUM = [
  'twelve',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'quarter',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'twenty-one',
  'twenty-two',
  'twenty-three',
  'twenty-four',
  'twenty-five',
  'twenty-six',
  'twenty-seven',
  'twenty-eight',
  'twenty-nine',
  'half'
]

/** "it's ten past nine". Minutes are named exactly (no rounding to five). */
export function timeInWords(hours, minutes) {
  const h12 = (h) => NUM[h % 12]
  const mins = (m) =>
    m === 15 || m === 30 ? NUM[m] : `${NUM[m]} ${m === 1 ? 'minute' : 'minutes'}`
  const plain = (m) => (m === 15 || m === 30 ? NUM[m] : m % 5 === 0 ? NUM[m] : mins(m))
  if (minutes === 0) {
    if (hours % 24 === 0) return 'midnight'
    if (hours % 24 === 12) return 'noon'
    return `${h12(hours)} o’clock`
  }
  if (minutes <= 30) return `${plain(minutes)} past ${h12(hours)}`
  return `${plain(60 - minutes)} to ${h12(hours + 1)}`
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildThread, messagesAt, SHOWN } from '../src/shared/messages.mjs'

// a line with its words sung 400 ms apart
const L = (t, text) => {
  const ws = text.split(' ')
  return {
    t,
    text,
    end: t + ws.length * 400,
    words: ws.map((w, k) => ({ w, t: t + k * 400, end: t + (k + 1) * 400 }))
  }
}

test('lines alternate sides, starting on the left', () => {
  const th = buildThread([
    L(1000, 'Yeah yeah'),
    { t: 3000, text: '' },
    L(4000, 'I went'),
    L(6000, 'They')
  ])
  assert.deepEqual(
    th.map((m) => [m.text, m.from, m.i]),
    [
      ['Yeah yeah', 'them', 0],
      ['I went', 'me', 2],
      ['They', 'them', 3]
    ]
  )
})

test('the bubble fills word by word as the line is sung', () => {
  const th = buildThread([L(1000, 'I drove to town, bought bread')])
  const at = (p) => messagesAt(th, p).items.at(-1).words.join(' ')
  assert.equal(at(1000), 'I')
  assert.equal(at(1500), 'I drove')
  assert.equal(at(2250), 'I drove to town,')
  assert.equal(at(4500), 'I drove to town, bought bread')
  assert.equal(messagesAt(th, 900).items.length, 0, 'nothing before the first line')
})

test('the key changes with each word, and only then', () => {
  const th = buildThread([L(1000, 'one two three')])
  assert.equal(messagesAt(th, 1000).key, messagesAt(th, 1300).key)
  assert.notEqual(messagesAt(th, 1300).key, messagesAt(th, 1450).key)
})

test('three bubbles at most: the one being sung and two before it, whole', () => {
  const th = buildThread([L(1000, 'a b'), L(3000, 'c d'), L(5000, 'e f'), L(7000, 'g h')])
  const v = messagesAt(th, 7100)
  assert.equal(v.items.filter((m) => m.age < SHOWN).length, SHOWN)
  assert.deepEqual(
    v.items.map((m) => [m.words.join(' '), m.age, m.from]),
    [
      ['a b', 3, 'them'],
      ['c d', 2, 'me'],
      ['e f', 1, 'them'],
      ['g', 0, 'me']
    ]
  )
  assert.equal(v.items[0].first, true, 'the one fading out is the first line')
  assert.equal(messagesAt(th, 9000).items.length, SHOWN + 1, 'never more than one fading')
  assert.equal(messagesAt(th, 1100).items[0].first, true)
})

test('a long instrumental fades the messages, and the next line starts afresh', () => {
  const th = buildThread([L(1000, 'a b'), L(20000, 'c')])
  assert.equal(messagesAt(th, 2500).leaving, false)
  const quiet = messagesAt(th, 9000)
  assert.equal(quiet.leaving, true, 'quiet: the last messages fade')
  assert.equal(quiet.items.at(-1).words.join(' '), 'a b', 'whole, as they leave')
  assert.equal(messagesAt(th, 19200).leaving, true, 'still quiet just before the next line')
  const after = messagesAt(th, 20000)
  assert.equal(after.leaving, false)
  assert.deepEqual(
    after.items.map((m) => m.words.join(' ')),
    ['c'],
    'the earlier lines do not come back'
  )
})

test('a short pause keeps the conversation going', () => {
  const th = buildThread([L(1000, 'a b'), L(5000, 'c')])
  assert.equal(messagesAt(th, 4900).leaving, false)
  assert.deepEqual(
    messagesAt(th, 5000).items.map((m) => m.words.join(' ')),
    ['a b', 'c']
  )
})

test('word timings split differently from the text are spread over its words', () => {
  const th = buildThread([
    {
      t: 1000,
      text: 'one two three four',
      words: [
        { w: 'one two', t: 1000 },
        { w: 'three four', t: 3000 }
      ]
    }
  ])
  assert.equal(messagesAt(th, 1100).items[0].words.join(' '), 'one two')
  assert.equal(messagesAt(th, 3100).items[0].words.join(' '), 'one two three four')
})

test('lines without word timing show whole', () => {
  const th = buildThread([{ t: 1000, text: 'just a line', end: 3000 }])
  assert.equal(messagesAt(th, 1000).items[0].words.join(' '), 'just a line')
})

test('no lyrics: no messages', () => {
  assert.deepEqual(buildThread([]), [])
  assert.deepEqual(buildThread(null), [])
  assert.deepEqual(messagesAt([], 5000).items, [])
})

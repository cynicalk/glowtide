import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildThread, emojiFor, messagesAt, VISIBLE } from '../src/shared/messages.mjs'

const L = (t, text, end) => ({ t, text, end: end ?? t + 2000 })

test('a line picks up an emoji from its words', () => {
  assert.equal(emojiFor('I fell in love tonight'), '❤️')
  assert.equal(emojiFor('Lovers in the dark'), '❤️')
  assert.equal(emojiFor('My heart is broken'), '💔')
  assert.equal(emojiFor('Set the night on fire'), '🔥', 'a stronger word wins wherever it sits')
  assert.equal(emojiFor('Dancing all night'), '🌙')
  assert.equal(emojiFor('Dancing with you'), '💃')
  assert.equal(emojiFor('Just another line'), null)
  assert.equal(emojiFor(''), null)
  assert.equal(emojiFor(null), null)
})

test('short stems only match whole words', () => {
  assert.equal(emojiFor('Sunday morning'), null, '"sun" is not "sunday"')
  assert.equal(emojiFor('Under the sun'), '☀️')
  assert.equal(emojiFor('A birthday card'), null, '"car" is not "card"')
  assert.equal(emojiFor('Take the car'), '🚗')
})

test('the singer starts; the turn passes at each verse', () => {
  const lines = [
    L(1000, 'one'),
    L(3000, 'two'),
    { t: 5000, text: '' }, // a break in the file
    L(6000, 'three'),
    L(20000, 'four') // a long pause
  ]
  const th = buildThread(lines)
  assert.deepEqual(
    th.map((m) => [m.text, m.from, m.i]),
    [
      ['one', 'them', 0],
      ['two', 'them', 1],
      ['three', 'me', 3],
      ['four', 'them', 4]
    ]
  )
})

test('typing shows just before a line, from whoever sends it', () => {
  const th = buildThread([L(1000, 'one'), L(4000, 'two'), L(4100, 'three')])
  assert.equal(messagesAt(th, 0).typing, 'them', 'before the first line')
  assert.equal(messagesAt(th, 0).index, -1)
  assert.equal(messagesAt(th, 1500).typing, null, 'a while to go')
  assert.equal(messagesAt(th, 2600).typing, 'them')
  assert.equal(messagesAt(th, 4050).typing, null, 'the previous line only just arrived')
  const end = messagesAt(th, 9000)
  assert.equal(end.typing, null)
  assert.equal(end.index, 2)
  assert.deepEqual(
    end.messages.map((m) => m.text),
    ['one', 'two', 'three']
  )
})

test('only the last of a run carries the tail', () => {
  const th = buildThread([L(1000, 'a'), L(2000, 'b'), L(9500, 'c'), L(10500, 'd')])
  // c has only just arrived: no typing yet, so c ends its run
  assert.deepEqual(
    messagesAt(th, 9700).messages.map((m) => [m.text, m.from, m.tail]),
    [
      ['a', 'them', false],
      ['b', 'them', true],
      ['c', 'me', true]
    ]
  )
  // now "me" is typing d: c's tail waits for it
  const v = messagesAt(th, 10000)
  assert.equal(v.typing, 'me')
  assert.equal(v.messages.at(-1).tail, false)
  assert.equal(messagesAt(th, 11000).messages.at(-1).tail, true)
})

test('old messages scroll away; the key changes only when something shows', () => {
  const lines = Array.from({ length: 20 }, (_, k) => L(1000 + k * 3000, `line ${k}`))
  const th = buildThread(lines)
  const v = messagesAt(th, 60000)
  assert.equal(v.messages.length, VISIBLE)
  assert.equal(v.messages.at(-1).text, 'line 19')
  assert.equal(v.first, false)
  assert.equal(messagesAt(th, 1100).first, true)
  assert.equal(messagesAt(th, 1100).key, messagesAt(th, 1200).key)
  assert.notEqual(messagesAt(th, 1100).key, messagesAt(th, 3600).key)
})

test('reactions land on the last message before a reply, once the reply arrives', () => {
  const lines = []
  for (let v = 0; v < 12; v++) lines.push(L(v * 20000, `verse ${v} love`), L(v * 20000 + 2000, 'x'))
  const th = buildThread(lines, 42)
  const reacted = th.filter((m) => m.reaction)
  assert.ok(reacted.length > 0, 'some get one')
  assert.ok(reacted.length < 12, 'not every one')
  for (const m of reacted) {
    const k = th.indexOf(m)
    assert.notEqual(th[k + 1].from, m.from)
    assert.ok(['❤️', '‼️', '😂', '👍', '👎', '❓'].includes(m.reaction))
    assert.equal(messagesAt(th, th[k + 1].t - 1).messages.at(-1).reaction, null)
    const after = messagesAt(th, th[k + 1].t).messages.find((x) => x.i === m.i)
    assert.equal(after.reaction, m.reaction)
  }
  // the same song always reacts the same way
  assert.deepEqual(
    buildThread(lines, 42).map((m) => m.reaction),
    th.map((m) => m.reaction)
  )
})

test('no lyrics: an empty conversation', () => {
  assert.deepEqual(buildThread([]), [])
  assert.deepEqual(buildThread(null), [])
  const v = messagesAt([], 5000)
  assert.deepEqual(v.messages, [])
  assert.equal(v.typing, null)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timeInWords } from '../src/shared/clock.mjs'

test('time in words', () => {
  assert.equal(timeInWords(9, 0), 'nine o’clock')
  assert.equal(timeInWords(0, 0), 'midnight')
  assert.equal(timeInWords(12, 0), 'noon')
  assert.equal(timeInWords(10, 15), 'quarter past ten')
  assert.equal(timeInWords(10, 30), 'half past ten')
  assert.equal(timeInWords(10, 45), 'quarter to eleven')
  assert.equal(timeInWords(5, 35), 'twenty-five to six')
  assert.equal(timeInWords(23, 50), 'ten to twelve')
  assert.equal(timeInWords(13, 2), 'two minutes past one')
  assert.equal(timeInWords(7, 59), 'one minute to eight')
  assert.equal(timeInWords(11, 58), 'two minutes to twelve')
})

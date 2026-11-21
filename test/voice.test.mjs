import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MODEL,
  MODEL_BYTES,
  MODEL_HOSTS,
  cleanTranscript,
  modelFile,
  modelUrl,
  parseWakeLine,
  spokenNumber,
  spokenTime,
  voiceToCommand
} from '../src/shared/voice.mjs'
import { parseCommand } from '../src/shared/commands.mjs'
import { callers } from '../src/shared/calls.mjs'

test('the model is pinned: a revision, and a size and SHA-256 for every file', () => {
  assert.match(MODEL.revision, /^[0-9a-f]{40}$/)
  for (const f of MODEL.files) {
    assert.match(f.sha256, /^[0-9a-f]{64}$/, f.path)
    assert.ok(f.size > 0, f.path)
  }
  assert.ok(MODEL_BYTES > 40e6 && MODEL_BYTES < 46e6)
  assert.equal(
    modelUrl('config.json'),
    `https://huggingface.co/onnx-community/whisper-tiny.en/resolve/${MODEL.revision}/config.json`
  )
})

test('only the manifest files are served, never another path', () => {
  assert.ok(modelFile('onnx/encoder_model_quantized.onnx'))
  assert.equal(modelFile('../settings.json'), null)
  assert.equal(modelFile('onnx/../config.json'), null)
  assert.equal(modelFile('glowtide.log'), null)
  assert.equal(modelFile(''), null)
})

test('downloads follow only https links to Hugging Face and its CDN', () => {
  assert.ok(MODEL_HOSTS.test('https://huggingface.co/x'))
  assert.ok(MODEL_HOSTS.test('https://us.aws.cdn.hf.co/xet-bridge-us/abc'))
  assert.ok(MODEL_HOSTS.test('https://cas-bridge.xethub.hf.co/x'))
  assert.ok(!MODEL_HOSTS.test('http://huggingface.co/x'))
  assert.ok(!MODEL_HOSTS.test('https://huggingface.co.evil.com/x'))
  assert.ok(!MODEL_HOSTS.test('https://evilhf.co/x'))
  assert.ok(!MODEL_HOSTS.test('https://evil.com/huggingface.co/'))
})

test('wake helper lines', () => {
  assert.deepEqual(parseWakeLine('wake 0.93\r'), { wake: 0.93 })
  assert.deepEqual(parseWakeLine('ready en-US'), { ready: 'en-US' })
  assert.deepEqual(parseWakeLine('error no-recogniser'), { error: 'no-recogniser' })
  assert.equal(parseWakeLine('wake lots'), null)
  assert.equal(parseWakeLine('something else'), null)
})

test('spoken numbers and times', () => {
  assert.equal(spokenNumber('forty'), 40)
  assert.equal(spokenNumber('forty five'), 45)
  assert.equal(spokenNumber('forty-five'), 45)
  assert.equal(spokenNumber('45'), 45)
  assert.equal(spokenNumber('a hundred'), 100)
  assert.equal(spokenNumber('seven'), 7)
  assert.equal(spokenNumber('lots'), null)
  assert.equal(spokenTime('1:30'), '1:30')
  assert.equal(spokenTime('90 seconds'), '1:30')
  assert.equal(spokenTime('one minute thirty'), '1:30')
  assert.equal(spokenTime('2 minutes'), '2:00')
  assert.equal(spokenTime('one thirty'), '1:30')
  assert.equal(spokenTime('two oh five'), '2:05')
  assert.equal(spokenTime('the chorus'), null)
})

test("what Whisper writes for silence or music isn't taken as speech", () => {
  assert.equal(cleanTranscript(' [BLANK_AUDIO]'), '')
  assert.equal(cleanTranscript(' you'), '')
  assert.equal(cleanTranscript(' Thank you.'), '')
  assert.equal(cleanTranscript('(music)'), '')
  assert.equal(cleanTranscript('♪ ♪'), '')
  assert.equal(cleanTranscript(' Next song.'), 'Next song')
  assert.equal(cleanTranscript('Hey Glowtide, pause.'), 'pause')
})

const say = (t) => voiceToCommand(t)

test('spoken commands become the typed ones, and run at once', () => {
  for (const [spoken, typed] of [
    ['Next.', 'next'],
    ['Skip this song.', 'next'],
    ['Play the next song', 'next'],
    ['Go back.', 'previous'],
    ['Previous track', 'previous'],
    ['Pause the music.', 'pause'],
    ['Stop.', 'pause'],
    ['Resume', 'play'],
    ['Play.', 'play'],
    ['Shuffle on', 'shuffle'],
    ['I love this song!', 'like'],
    ['Show the lyrics', 'lyrics'],
    ['Full screen', 'fullscreen'],
    ['Set the volume to forty.', 'volume 40'],
    ['Volume 75 percent', 'volume 75'],
    ['Mute', 'volume 0'],
    ['Go to one minute thirty.', 'seek 1:30'],
    ['Skip to 2:15', 'seek 2:15'],
    ['Please pause', 'pause']
  ]) {
    const v = say(spoken)
    assert.equal(v.text, typed, spoken)
    assert.equal(v.autorun, true, spoken)
    // and the command bar reads it as that command
    assert.ok(parseCommand(v.text).command, spoken)
  }
})

test('play and queue a song: searched, and the first one found plays', () => {
  assert.deepEqual(say('Play Blinding Lights by The Weeknd.'), {
    text: 'play Blinding Lights The Weeknd',
    autorun: true
  })
  assert.deepEqual(say('Put on some Daft Punk'), { text: 'play Daft Punk', autorun: true })
  assert.deepEqual(say('Add Levitating to the queue.'), { text: 'queue Levitating', autorun: true })
  assert.deepEqual(say('Queue Levitating'), { text: 'queue Levitating', autorun: true })
  assert.deepEqual(say('Play Hotel California on Spotify'), {
    text: 'play Hotel California',
    autorun: true
  })
  const p = parseCommand(say('Play Blinding Lights').text)
  assert.equal(p.query, 'Blinding Lights')
  assert.equal(p.queue, false)
  assert.equal(parseCommand(say('Queue Levitating').text).queue, true)
})

test('anything else is searched and waits for a choice', () => {
  assert.deepEqual(say('Bohemian Rhapsody.'), { text: 'Bohemian Rhapsody', autorun: false })
  assert.deepEqual(say('[BLANK_AUDIO]'), { text: '', autorun: false })
  // a volume it can't read isn't guessed
  assert.equal(say('Volume up').autorun, false)
})

test("Glowtide's own listening, and its wake word helper, are never a call", () => {
  const users = [
    'C:#Users#me#AppData#Local#Programs#glowtide#Glowtide.exe',
    'C:#Windows#System32#WindowsPowerShell#v1.0#powershell.exe',
    'C:#Users#me#AppData#Local#Discord#app-1#Discord.exe'
  ]
  assert.deepEqual(callers(users, 'any', ['glowtide', 'powershell']), [users[2]])
  assert.deepEqual(callers(users, 'any'), users)
  assert.deepEqual(callers(users, 'calls', ['glowtide']), [users[2]])
})

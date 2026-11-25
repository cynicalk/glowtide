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
  assert.ok(MODEL_BYTES > 60e6 && MODEL_BYTES < 70e6)
  assert.equal(
    modelUrl('config.json'),
    `https://huggingface.co/onnx-community/moonshine-base-ONNX/resolve/${MODEL.revision}/config.json`
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

test("what a speech model writes for silence or music isn't taken as speech", () => {
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

test("the microphone: never Stereo Mix or another 'what the PC plays' input", async () => {
  const { chooseMic, isLoopbackMic } = await import('../src/shared/voice.mjs')
  const pc = [
    { deviceId: 'default', label: 'Default - Stereo Mix (Realtek(R) Audio)' },
    { deviceId: 'communications', label: 'Communications - Stereo Mix (Realtek(R) Audio)' },
    { deviceId: 'sm', label: 'Stereo Mix (Realtek(R) Audio)' },
    { deviceId: 'fx', label: 'Internal AUX Jack (FxSound Audio Enhancer)' },
    { deviceId: 'mic', label: 'Microphone Array (Realtek(R) Audio)' }
  ]
  // Windows' default is Stereo Mix: the real microphone is used instead
  assert.equal(chooseMic(pc), 'mic')
  // a default that is a microphone is kept
  const ok = [{ deviceId: 'default', label: 'Default - Headset (WH-1000XM4)' }, ...pc.slice(2)]
  assert.equal(chooseMic(ok), 'default')
  // the one picked in Settings wins, by name
  assert.equal(chooseMic(pc, 'Internal AUX Jack (FxSound Audio Enhancer)'), 'fx')
  // a picked one that's gone falls back to choosing
  assert.equal(chooseMic(pc, 'USB mic that was unplugged'), 'mic')
  // only loopback inputs: nothing to listen with
  assert.equal(chooseMic(pc.slice(0, 4)), null)
  // no names yet: Windows' default
  assert.equal(chooseMic([{ deviceId: 'default', label: '' }]), 'default')
  assert.equal(chooseMic([]), null)
  assert.ok(isLoopbackMic('CABLE Output (VB-Audio Virtual Cable)'))
  assert.ok(isLoopbackMic('Steam Streaming Microphone'))
  assert.ok(!isLoopbackMic('Microphone (NVIDIA Broadcast)'))
  assert.ok(!isLoopbackMic('Headset Microphone (Jabra)'))
})

test('Settings offers only real microphones, and shows one as chosen', async () => {
  const { micOptions } = await import('../src/shared/voice.mjs')
  const pc = [
    'Stereo Mix (Realtek(R) Audio)',
    'Internal AUX Jack (FxSound Audio Enhancer)',
    'Line In (Realtek(R) Audio)',
    'Microphone Array (Realtek(R) Audio)'
  ]
  // nothing picked yet: the microphone array, and Stereo Mix isn't offered at all
  assert.deepEqual(micOptions(pc), {
    options: ['Microphone Array (Realtek(R) Audio)', 'Line In (Realtek(R) Audio)'],
    value: 'Microphone Array (Realtek(R) Audio)'
  })
  // the one used last, then the one picked, win
  assert.equal(micOptions(pc, '', 'Line In (Realtek(R) Audio)').value, 'Line In (Realtek(R) Audio)')
  assert.equal(
    micOptions(pc, 'Line In (Realtek(R) Audio)', 'Microphone Array (Realtek(R) Audio)').value,
    'Line In (Realtek(R) Audio)'
  )
  // a picked one that's gone: the likeliest instead
  assert.equal(micOptions(pc, 'USB mic').value, 'Microphone Array (Realtek(R) Audio)')
  assert.deepEqual(micOptions(['Stereo Mix (Realtek(R) Audio)']), { options: [], value: '' })
})

test("the registry's recording inputs, named as Windows names them", async () => {
  const { parseRegValues, inputLabels } = await import('../src/shared/devices.mjs')
  const K = String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture`
  const a = '{11111111-1111-1111-1111-111111111111}'
  const b = '{22222222-2222-2222-2222-222222222222}'
  const key = (id, props = false) => `${K}\\${id}${props ? '\\Properties' : ''}`
  const states = parseRegValues(
    `${key(a)}\n    DeviceState    REG_DWORD    0x1\n\n${key(b)}\n    DeviceState    REG_DWORD    0x4\n`,
    'DeviceState'
  )
  const D = '{a45c254e-df1c-4efd-8020-67d146a850e0},2'
  const N = '{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
  const descs = parseRegValues(
    `${key(a, true)}\n    ${D}    REG_SZ    Microphone Array\n${key(b, true)}\n    ${D}    REG_SZ    Line In\n`,
    D
  )
  const names = parseRegValues(`${key(a, true)}\n    ${N}    REG_SZ    Realtek(R) Audio\n`, N)
  // only the connected one
  assert.deepEqual(inputLabels(states, descs, names), ['Microphone Array (Realtek(R) Audio)'])
})

test('"Hey Glow" is checked against what the speech model heard', async () => {
  const { isWakeText, parseWakeLine } = await import('../src/shared/voice.mjs')
  for (const t of [
    'Hey Glow.',
    'Hey, glow!',
    'Hi Glow',
    'okay glow',
    'Hey Glowtide.',
    'hey glow tide',
    // said at the end of a little talk, or with a word after it
    'right, so hey glow',
    'Hey glow, please'
  ])
    assert.ok(isWakeText(t), t)
  for (const t of [
    '',
    null,
    ' you',
    'hey google',
    'hey go',
    'hello',
    'glow',
    'the glow of it',
    ' Halo',
    'Hey low.',
    'Hey, look!',
    'hey global warming is getting worse',
    // "hey glow" in the middle of talk isn't the wake word
    'hey glow is a nice name for an app I think'
  ])
    assert.ok(!isWakeText(t), String(t))
  assert.deepEqual(parseWakeLine('maybe 0.34'), { maybe: 0.34 })
})

test('the wake word is taken off what was said, however the model spelled it', async () => {
  const { voiceToCommand } = await import('../src/shared/voice.mjs')
  assert.deepEqual(voiceToCommand('Hey Glow, next song.'), { text: 'next', autorun: true })
  assert.deepEqual(voiceToCommand('Hi glow tide, pause'), { text: 'pause', autorun: true })
  assert.deepEqual(voiceToCommand('Hey Glow.'), { text: '', autorun: false })
  assert.deepEqual(voiceToCommand('Hey Glowtide.'), { text: '', autorun: false })
  // a song that merely starts with "glow" is left alone
  assert.equal(voiceToCommand('Glow by Ellie Goulding').text, 'Glow by Ellie Goulding')
})

test('words a speech model hears in place of a command still work', async () => {
  const { voiceToCommand } = await import('../src/shared/voice.mjs')
  for (const [heard, typed] of [
    ['Post the music.', 'pause'],
    ['Post a music', 'pause'],
    ['For the music.', 'pause'],
    ['Said the volume to forty.', 'volume 40'],
    ['Skip this so.', 'next'],
    ['Ad levitating to the queue', 'queue levitating'],
    ['and levitating to the tube.', 'queue levitating'],
    ['Played Shape of You', 'play Shape of You'],
    ['Please shape of you by Ed Sheeran.', 'play shape of you Ed Sheeran']
  ]) {
    const v = voiceToCommand(heard)
    assert.equal(v.text, typed, heard)
    assert.equal(v.autorun, true, heard)
  }
  // still not commands
  assert.equal(voiceToCommand('Post Malone').autorun, false)
  assert.equal(voiceToCommand("For What It's Worth").autorun, false)
  assert.equal(voiceToCommand('Please').autorun, false)
})

test('the sound handed to the model is cut to the speech', async () => {
  const { speechSpan } = await import('../src/shared/voice.mjs')
  const rate = 16000
  // 2 s of near-quiet, 0.5 s of "speech", 0.5 s of near-quiet
  const a = new Float32Array(rate * 3)
  for (let i = 0; i < a.length; i++) a[i] = (Math.random() - 0.5) * 0.002
  for (let i = rate * 2; i < rate * 2.5; i++) a[i] = Math.sin(i / 7) * 0.3
  const s = speechSpan(a, rate)
  // the speech and a little either side, not the 2 s before it
  assert.ok(s.length > rate * 0.5 && s.length < rate * 1.1, String(s.length / rate))
  assert.ok(
    s.byteOffset / 4 > rate * 1.7 && s.byteOffset / 4 < rate * 2,
    String(s.byteOffset / 4 / rate)
  )
  // given to the model with half a second of silence either side
  const { forModel } = await import('../src/shared/voice.mjs')
  const m = forModel(a, rate)
  assert.equal(m.length, s.length + rate)
  assert.equal(m[rate / 4], 0)
  assert.equal(forModel(new Float32Array(rate), rate).length, 0)
  // all quiet: nothing
  assert.equal(speechSpan(new Float32Array(rate)).length, 0)
  assert.equal(speechSpan(new Float32Array(0)).length, 0)
})

test('switching where songs come from, out loud', async () => {
  const { voiceToCommand } = await import('../src/shared/voice.mjs')
  const { parseCommand } = await import('../src/shared/commands.mjs')
  for (const [said, typed] of [
    ['Switch to Spotify.', 'spotify'],
    ['Use YouTube Music', 'youtube'],
    ['Play from YouTube.', 'youtube']
  ]) {
    const v = voiceToCommand(said)
    assert.deepEqual(v, { text: typed, autorun: true }, said)
    assert.ok(parseCommand(v.text).command, said)
  }
  assert.equal(parseCommand('spotify').command.id, 'useSpotify')
  assert.equal(parseCommand('youtube').command.id, 'useYouTube')
  // "play X on YouTube" is still a song
  assert.equal(voiceToCommand('Play Kesariya on YouTube').text, 'play Kesariya')
})

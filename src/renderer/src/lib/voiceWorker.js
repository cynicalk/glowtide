// Speech to text for the command bar, off the page's thread: Whisper (tiny, English) run by
// transformers.js on the CPU. The model is read from glowtide-voice:// (downloaded and checked
// by the main process), never fetched from the internet here.
//
// in:  { id, type: 'load' } | { id, type: 'transcribe', audio: Float32Array (16 kHz mono) }
// out: { id, ok: true, text? } | { id, ok: false, error }

import { env, pipeline } from '@huggingface/transformers'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = 'glowtide-voice://model/'
env.useBrowserCache = false
env.useWasmCache = false
env.backends.onnx.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href }
env.backends.onnx.wasm.numThreads = 1 // threads need cross-origin isolation, which pages here don't have

let asr = null
const load = () =>
  (asr ??= pipeline('automatic-speech-recognition', 'whisper-tiny.en', {
    dtype: 'q8',
    device: 'wasm'
  }).catch((e) => {
    asr = null
    throw e
  }))

self.onmessage = async ({ data }) => {
  const { id, type } = data || {}
  try {
    const run = await load()
    if (type === 'load') return self.postMessage({ id, ok: true })
    if (type === 'transcribe') {
      const out = await run(data.audio)
      return self.postMessage({ id, ok: true, text: String(out?.text ?? '') })
    }
    self.postMessage({ id, ok: false, error: 'unknown request' })
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e).slice(0, 300) })
  }
}

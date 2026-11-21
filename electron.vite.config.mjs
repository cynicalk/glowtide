import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: [
        { find: '@renderer', replacement: resolve('src/renderer/src') },
        // voice: transformers.js asks for onnxruntime's WebGPU build; the CPU-only one is
        // enough for Whisper tiny and is half the size
        { find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' }
      ]
    },
    // the speech worker (lib/voiceWorker.js) is a module, as transformers.js needs
    worker: { format: 'es' },
    plugins: [react()]
  }
})

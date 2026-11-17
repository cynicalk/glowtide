import { contextBridge, ipcRenderer } from 'electron'

const on = (channel) => (cb) => {
  const fn = (_e, v) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

contextBridge.exposeInMainWorld('glowtide', {
  init: () => ipcRenderer.invoke('init'),
  onState: on('state'),
  onLyrics: on('lyrics'),
  onSettings: on('settings'),
  onDebugPanel: on('debug:panel'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  control: (action, arg) => ipcRenderer.invoke('control', action, arg),
  query: (kind, arg) => ipcRenderer.invoke('query', kind, arg),
  setDemo: (on) => ipcRenderer.invoke('demo', on),
  nudgeLyrics: (delta) => ipcRenderer.invoke('lyrics:nudge', delta),
  connect: () => ipcRenderer.invoke('auth:connect'),
  disconnect: () => ipcRenderer.invoke('auth:disconnect'),
  windowAction: (a) => ipcRenderer.invoke('window', a),
  open: (url) => ipcRenderer.invoke('open', url)
})

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
  onYtCommand: on('yt:command'),
  ytState: (m) => ipcRenderer.send('yt:state', m),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  control: (action, arg) => ipcRenderer.invoke('control', action, arg),
  query: (kind, arg) => ipcRenderer.invoke('query', kind, arg),
  setSource: (src) => ipcRenderer.invoke('source', src),
  selectSystemApp: (appId) => ipcRenderer.invoke('system:select', appId),
  nudgeLyrics: (delta) => ipcRenderer.invoke('lyrics:nudge', delta),
  saveTimedLyrics: (lines, trackId) => ipcRenderer.invoke('lyrics:saveTimed', lines, trackId),
  removeTimedLyrics: () => ipcRenderer.invoke('lyrics:removeTimed'),
  exportTimedLyrics: () => ipcRenderer.invoke('lyrics:exportTimed'),
  lyricsCandidates: (q) => ipcRenderer.invoke('lyrics:candidates', q),
  chooseLyrics: (id) => ipcRenderer.invoke('lyrics:choose', id),
  pickBackground: () => ipcRenderer.invoke('background:pick'),
  connect: () => ipcRenderer.invoke('auth:connect'),
  disconnect: () => ipcRenderer.invoke('auth:disconnect'),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  windowAction: (a) => ipcRenderer.invoke('window', a),
  displays: () => ipcRenderer.invoke('displays'),
  stage: (action) => ipcRenderer.invoke('stage', action),
  open: (url) => ipcRenderer.invoke('open', url),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  quit: () => ipcRenderer.invoke('app:quit'),
  showPlayer: () => ipcRenderer.invoke('player:show'),
  closeQuick: () => ipcRenderer.invoke('quick:close'),
  closeCommand: () => ipcRenderer.invoke('command:close'),
  onCommandOpen: on('command:open'),
  share: () => ipcRenderer.invoke('share'),
  recordingShortcut: (on) => ipcRenderer.invoke('shortcuts:recording', !!on)
})

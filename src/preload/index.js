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
  connect: () => ipcRenderer.invoke('auth:connect'),
  disconnect: () => ipcRenderer.invoke('auth:disconnect'),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  windowAction: (a) => ipcRenderer.invoke('window', a),
  displays: () => ipcRenderer.invoke('displays'),
  stage: (action) => ipcRenderer.invoke('stage', action),
  toggleWidgets: () => ipcRenderer.invoke('widgets:toggle'),
  widgetEdit: (kind) => ipcRenderer.invoke('widget:edit', kind),
  widgetDone: (kind) => ipcRenderer.invoke('widget:done', kind),
  widgetSize: (kind) => ipcRenderer.invoke('widget:size', kind),
  widgetResize: (kind, w, h) => ipcRenderer.send('widget:resize', kind, w, h),
  open: (url) => ipcRenderer.invoke('open', url),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  quit: () => ipcRenderer.invoke('app:quit'),
  showPlayer: () => ipcRenderer.invoke('player:show'),
  closeQuick: () => ipcRenderer.invoke('quick:close')
})

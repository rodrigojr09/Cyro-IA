const { contextBridge, ipcRenderer } = require('electron');
if (process.argv.includes('--jarvis-encrypted-storage'))
  contextBridge.exposeInMainWorld('jarvisStorage', {
    getItem: (key) => ipcRenderer.sendSync('jarvis:storage', key),
    setItem: (key, value) => ipcRenderer.sendSync('jarvis:storage', key, value, true),
    removeItem: (key) => ipcRenderer.sendSync('jarvis:storage', key, null, true),
  });
const invoke = (name, ...args) => ipcRenderer.invoke('quick:' + name, ...args);
contextBridge.exposeInMainWorld('quick', {
  toggle: () => invoke('toggle'),
  move: (x, y, save) => invoke('move', x, y, save),
  send: (message, useProject) => invoke('send', message, useProject),
  state: () => invoke('state'),
  openMain: () => invoke('open-main'),
  resize: (height) => invoke('resize', height),
  resizeInput: (height) => invoke('resize-input', height),
  pause: (reason, value) => invoke('pause', reason, value),
  pin: (value) => invoke('pin', value),
  hide: () => invoke('hide'),
  collapse: () => invoke('collapse'),
  copy: () => invoke('copy'),
  speak: () => invoke('speak'),
  stop: () => invoke('stop'),
  claim: () => invoke('claim'),
  voice: (value) => invoke('voice', value),
  audioFailed: (epoch) => invoke('audio-failed', epoch),
  audioEnded: (epoch) => invoke('audio-ended', epoch),
  onAudio: (callback) => ipcRenderer.on('quick:audio', (_, data) => callback(data)),
  onState: (callback) => ipcRenderer.on('quick:state', (_, data) => callback(data)),
  onFocus: (callback) => ipcRenderer.on('quick:focus', () => callback()),
  onStopAudio: (callback) => ipcRenderer.on('jarvis:stop-audio', () => callback()),
});

contextBridge.exposeInMainWorld('jarvisClipboard', {
  state: () => ipcRenderer.invoke('clipboard:state'),
  configure: (value) => ipcRenderer.invoke('clipboard:configure', value),
  claim: (replaceId) => ipcRenderer.invoke('clipboard:claim', replaceId),
  dismiss: (id) => ipcRenderer.invoke('clipboard:dismiss', id),
  discard: () => ipcRenderer.invoke('clipboard:discard'),
  openLink: (id) => ipcRenderer.invoke('clipboard:open-link', id),
  onState: (callback) => ipcRenderer.on('clipboard:state', (_event, value) => callback(value)),
  onSound: (callback) => ipcRenderer.on('clipboard:sound', (_event, value) => callback(value)),
});

contextBridge.exposeInMainWorld('jarvisSpotify', {
  request: (input) => ipcRenderer.invoke('spotify:request', input),
  onChanged: (callback) => ipcRenderer.on('spotify:changed', () => callback()),
});

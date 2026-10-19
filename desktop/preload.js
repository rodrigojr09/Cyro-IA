const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvisWindow', {
  api: (route, options) => ipcRenderer.invoke('jarvis:api', route, options),
  authorizeFolder: () => ipcRenderer.invoke('jarvis:authorize-folder'),
  copyCode: text => ipcRenderer.invoke('jarvis:copy-code', text),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close')
});

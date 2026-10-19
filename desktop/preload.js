const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvisWindow', {
  api: (route, options) => ipcRenderer.invoke('jarvis:api', route, options),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close')
});

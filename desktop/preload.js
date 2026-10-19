const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvisWindow', {
  api: (route, options) => ipcRenderer.invoke('jarvis:api', route, options),
  authorizeFolder: () => ipcRenderer.invoke('jarvis:authorize-folder'),
  copyCode: text => ipcRenderer.invoke('jarvis:copy-code', text),
  removeProject: id => ipcRenderer.invoke('jarvis:remove-project', id),
  manageChat: (id, action, title) => ipcRenderer.invoke('jarvis:manage-chat', id, action, title),
  expand: () => ipcRenderer.invoke('jarvis:expand'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close')
});

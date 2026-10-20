const { contextBridge, ipcRenderer } = require('electron');
let pendingChat = null,
  openCallback = null;
ipcRenderer.on('jarvis:open-chat', (_, id) => {
  pendingChat = id;
  if (openCallback) {
    openCallback(id);
    pendingChat = null;
  }
});
contextBridge.exposeInMainWorld('jarvisWindow', {
  openAIConfig: () => ipcRenderer.invoke('jarvis:open-ai-config'),
  quickSettings: () => ipcRenderer.invoke('jarvis:quick-settings'),
  configureQuick: (value) => ipcRenderer.invoke('jarvis:quick-configure', value),
  voicePreference: (value) => ipcRenderer.invoke('jarvis:voice-preference', value),
  claimAudio: () => ipcRenderer.invoke('jarvis:audio-claim'),
  onStopAudio: (callback) => ipcRenderer.on('jarvis:stop-audio', () => callback()),
  onOpenChat: (callback) => {
    openCallback = callback;
    if (pendingChat) {
      callback(pendingChat);
      pendingChat = null;
    }
  },
  api: (route, options) => ipcRenderer.invoke('jarvis:api', route, options),
  authorizeFolder: () => ipcRenderer.invoke('jarvis:authorize-folder'),
  copyCode: (text) => ipcRenderer.invoke('jarvis:copy-code', text),
  removeProject: (id) => ipcRenderer.invoke('jarvis:remove-project', id),
  manageChat: (id, action, title) => ipcRenderer.invoke('jarvis:manage-chat', id, action, title),
  openLink: (url) => ipcRenderer.invoke('jarvis:open-link', url),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
});

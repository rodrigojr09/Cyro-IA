const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvisAuth', {
  login: (value) => ipcRenderer.invoke('jarvis:login', value),
  logout: () => ipcRenderer.invoke('jarvis:logout'),
  state: () => ipcRenderer.invoke('jarvis:cloud-state'),
  onState: (callback) =>
    ipcRenderer.on('jarvis:cloud-state-changed', (_event, value) => callback(value)),
});
if (process.argv.includes('--jarvis-encrypted-storage'))
  contextBridge.exposeInMainWorld('jarvisStorage', {
    getItem: (key) => ipcRenderer.sendSync('jarvis:storage', key),
    setItem: (key, value) => ipcRenderer.sendSync('jarvis:storage', key, value, true),
    removeItem: (key) => ipcRenderer.sendSync('jarvis:storage', key, null, true),
  });
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
  permitMicrophone: () => ipcRenderer.invoke('jarvis:voice-input-permission'),
  chooseAttachments: (remaining) => ipcRenderer.invoke('jarvis:attachments-choose', remaining),
  attachmentInfo: (id) => ipcRenderer.invoke('jarvis:attachments-info', id),
  saveAttachment: (id) => ipcRenderer.invoke('jarvis:attachments-save', id),
  discardAttachment: (id) => ipcRenderer.invoke('jarvis:attachments-discard', id),
  onDelta: (callback) => ipcRenderer.on('jarvis:stream-delta', (_event, value) => callback(value)),
  cancelChat: () => ipcRenderer.invoke('jarvis:cancel-chat'),
  initialSettings: () => ipcRenderer.invoke('jarvis:initial-settings'),
  clearStorage: (scope) => ipcRenderer.invoke('jarvis:clear-storage', scope),
  openBackups: () => ipcRenderer.invoke('jarvis:open-backups'),
  openMigration: () => ipcRenderer.invoke('jarvis:open-migration'),
  openStartup: () => ipcRenderer.invoke('jarvis:open-startup'),
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

contextBridge.exposeInMainWorld('jarvisWriter', {
  chooseFile: (value) => ipcRenderer.invoke('writer:choose-file', value),
  file: (value) => ipcRenderer.invoke('writer:file', value),
  command: (value) => ipcRenderer.invoke('writer:command', value),
  cancel: (project) => ipcRenderer.invoke('writer:cancel', project),
  export: (value) => ipcRenderer.invoke('writer:export', value),
  dirty: (value) => ipcRenderer.invoke('writer:dirty', value),
});

contextBridge.exposeInMainWorld('jarvisSpotify', {
  request: (input) => ipcRenderer.invoke('spotify:request', input),
  onChanged: (callback) => ipcRenderer.on('spotify:changed', () => callback()),
});

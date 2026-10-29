// Keep the existing windows, IPC allowlists, Quick Chat and confirmation workflow.
process.env.JARVIS_CLOUD = '1';
delete process.env.JARVIS_AUTHENTICATED;
delete process.env.JARVIS_PORTABLE;
for (const key of Object.keys(process.env))
  if (key.startsWith('OPENAI_') || key.startsWith('SPOTIFY_')) delete process.env[key];
for(const key of ['DATABASE_URL','DIRECT_URL','CYRO_GITHUB_TOKEN','CYRO_PUBLISHER_SECRET'])delete process.env[key];
const { app, dialog, safeStorage, ipcMain, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const cloud = require('../scripts/session/cloud');
const dataDir =
  process.env.JARVIS_DATA_DIR ||
  (app.isPackaged
    ? path.join(app.getPath('appData'), 'JARVIS')
    : require('../scripts/app/portable-paths').resolveData({
        packaged: false,
        localAppData: process.env.LOCALAPPDATA,
        home: require('node:os').homedir(),
      }));
process.env.JARVIS_DATA_DIR = dataDir;
require('../scripts/app/portable-paths').configureElectron(app, dataDir);
let service;
require('../scripts/integrations/spotify-ipc').installSpotifyIPC({
  electron: require('electron'),
  service: () => service,
});
const microphoneGrants = new Map();
const mainPage = require('node:url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
app.on('web-contents-created', (_event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const allowed =
      permission === 'media' &&
      webContents?.getURL() === mainPage &&
      microphoneGrants.get(webContents.id) > Date.now() &&
      details.mediaTypes?.length === 1 &&
      details.mediaTypes[0] === 'audio';
    if (webContents) microphoneGrants.delete(webContents.id);
    callback(!!allowed);
  });
  contents.session.setPermissionCheckHandler(
    (webContents, permission, _origin, details) =>
      permission === 'media' &&
      details.mediaType === 'audio' &&
      webContents?.getURL() === mainPage &&
      microphoneGrants.get(webContents.id) > Date.now(),
  );
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
let queue = Promise.resolve();
ipcMain.handle('jarvis:voice-input-permission', async (event) => {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== mainPage)
    throw Error('Solicitação não autorizada.');
  const answer = await dialog.showMessageBox({
    type: 'question',
    message: 'Permitir entrada de voz nesta mensagem?',
    detail:
      'O reconhecimento disponível no Windows/runtime pode usar um serviço externo. A mensagem só será enviada quando você clicar em Enviar.',
    buttons: ['Cancelar', 'Permitir microfone'],
    defaultId: 0,
    cancelId: 0,
  });
  if (answer.response !== 1) return false;
  microphoneGrants.set(event.sender.id, Date.now() + 10000);
  return true;
});
function trusted(event, loginOnly = false) {
  const expected = require('node:url').pathToFileURL(path.join(__dirname, '..', 'login.html')).href;
  const main = require('node:url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  return (
    event.senderFrame === event.sender.mainFrame &&
    (event.senderFrame.url === expected || (!loginOnly && event.senderFrame.url === main))
  );
}
async function unlock() {
  process.env.JARVIS_AUTHENTICATED = '1';
  app.emit('jarvis:session-changed', true);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.getURL().endsWith('/login.html'))
      await win.loadFile(path.join(__dirname, '..', 'index.html'));
  }
}
async function login(value) {
  if (!service) throw Error('Login indisponível.');
  await service.login(value, require('node:os').hostname());
  try {
    await publish(service.current());
    await unlock();
  } catch {
    await lock();
    const error = Error(
      'Conta autenticada. Não foi possível conectar o serviço local. Reinicie o Cyro IA.',
    );
    error.code = 'DESKTOP_SESSION';
    throw error;
  }
}
ipcMain.handle('jarvis:login', async (event, value) => {
  if (!trusted(event, true)) throw Error('Solicitação não autorizada.');
  const pending = queue.then(() => login(value));
  queue = pending.catch(() => {});
  try {
    await pending;
    return { ok: true };
  } catch (error) {
    if (error.code === 'DESKTOP_SESSION') throw Error(error.message);
    throw Error('Login recusado. Confira e-mail, senha, acesso e conexão.');
  }
});
ipcMain.handle('jarvis:logout', async (event) => {
  if (!trusted(event)) throw Error('Solicitação não autorizada.');
  const pending = queue.then(async () => {
    await lock();
    await service?.logout().catch(() => {});
  });
  queue = pending.catch(() => {});
  await pending;
});
async function lock() {
  delete process.env.JARVIS_AUTHENTICATED;
  app.emit('jarvis:session-changed', false);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.getURL() === mainPage)
      await win.loadFile(path.join(__dirname, '..', 'login.html'));
  }
}
ipcMain.handle('jarvis:cloud-state', (event) => {
  if (!trusted(event)) throw Error('Solicitação não autorizada.');
  return service?.state() || { status: 'inactive', message: 'Inicializando conexão…' };
});
async function publish(session) {
  if (!session) return;
  // The local token is never exposed to a renderer or passed as a process argument.
  for (let i = 0; i < 100; i++) {
    let rejected = false;
    try {
      const local = (await fs.readFile(path.join(dataDir, '.local-token'), 'utf8')).trim();
      const response = await fetch('http://127.0.0.1:8765/desktop/cloud-session', {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': local },
        body: JSON.stringify({ origin: session.origin, credential: session.credential }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) return;
      rejected = [400, 401, 403].includes(response.status);
    } catch {}
    if (rejected)
      throw Error('Não foi possível validar a sessão no serviço local. Entre novamente.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error('Serviço local indisponível. Reinicie o Cyro IA.');
}
app
  .whenReady()
  .then(async () => {
    let origin = process.env.JARVIS_CLOUD_ORIGIN;
    if (app.isPackaged)
      origin = JSON.parse(
        await fs.readFile(path.join(__dirname, 'cloud-config.json'), 'utf8'),
      ).origin;
    if (!origin) throw Error('Configure JARVIS_CLOUD_ORIGIN antes de iniciar.');
    service = cloud.createCloud({ safeStorage, dataDir, origin, packaged: app.isPackaged });
    require('../scripts/updates/ipc').installUpdateIPC({electron:require('electron'),service:()=>service,origin,dataDir});
    const monitor = setInterval(
      () => {
        queue = queue
          .then(async () => {
            if (!service.current()) return;
            await service.refresh().catch(() => {});
            if (service.state().status === 'active') {
              try {
                await publish(service.current());
                await unlock();
              } catch {
                await lock();
              }
            } else await lock();
            for (const window of BrowserWindow.getAllWindows())
              window.webContents.send('jarvis:cloud-state-changed', service.state());
          })
          .catch(() => lock());
      },
      5 * 60 * 1000,
    );
    monitor.unref();
    queue = queue.then(async () => {
      const saved = await service.load().catch(() => null);
      if (saved) {
        await service.refresh().catch(() => {});
        if (service.state().status === 'active') {
          try {
            await publish(service.current());
            await unlock();
          } catch {
            await lock();
          }
        }
      }
    });
    await queue;
  })
  .catch(() =>
    dialog.showErrorBox(
      'Cyro IA Cloud',
      'Configure a origem Cloud HTTPS. A chave OpenAI pertence somente ao servidor.',
    ),
  );
require('../scripts/app/main.js');

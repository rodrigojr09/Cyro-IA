// Keep the existing windows, IPC allowlists, Quick Chat and confirmation workflow.
process.env.JARVIS_CLOUD = '1';
delete process.env.JARVIS_PORTABLE;
for (const key of Object.keys(process.env)) if (key.startsWith('OPENAI_')) delete process.env[key];
const { app, dialog, safeStorage, ipcMain, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const cloud = require('../services/cloud');
const dataDir = process.env.JARVIS_DATA_DIR || path.join(app.getPath('appData'), 'JARVIS');
process.env.JARVIS_DATA_DIR = dataDir;
require('../portable-paths').configureElectron(app, dataDir);
let service;
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
function trusted(event, activationOnly = false) {
  const expected = require('node:url').pathToFileURL(
    path.join(__dirname, '..', 'activation.html'),
  ).href;
  const main = require('node:url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
  return (
    event.senderFrame === event.sender.mainFrame &&
    (event.senderFrame.url === expected || (!activationOnly && event.senderFrame.url === main))
  );
}
async function unlock() {
  process.env.JARVIS_ACTIVATED = '1';
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents.getURL().endsWith('/activation.html'))
      await win.loadFile(path.join(__dirname, '..', 'index.html'));
  }
}
async function activate(value) {
  if (!service || typeof value !== 'string') throw Error('Ativação indisponível.');
  const link = value.startsWith('jarvis:') ? value : `jarvis://activate?token=${value}`;
  cloud.parseActivation(link);
  await publish(await service.activate(link, require('node:os').hostname()));
  await unlock();
}
ipcMain.handle('jarvis:activate', async (event, value) => {
  if (!trusted(event, true)) throw Error('Solicitação não autorizada.');
  const pending = queue.then(() => activate(value));
  queue = pending.catch(() => {});
  try {
    await pending;
    return { ok: true };
  } catch {
    throw Error('Ativação recusada. Confira código, conexão e limite de dispositivos.');
  }
});
ipcMain.handle('jarvis:cloud-state', (event) => {
  if (!trusted(event)) throw Error('Solicitação não autorizada.');
  return service?.state() || { status: 'inactive', message: 'Inicializando conexão…' };
});
async function publish(session) {
  if (!session) return;
  // The local token is never exposed to a renderer or passed as a process argument.
  for (let i = 0; i < 100; i++) {
    try {
      const local = (await fs.readFile(path.join(dataDir, '.local-token'), 'utf8')).trim();
      const response = await fetch('http://127.0.0.1:8765/desktop/cloud-session', {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': local },
        body: JSON.stringify({ origin: session.origin, credential: session.credential }),
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error('Serviço local indisponível. Reinicie o JARVIS.');
}
function receive(value) {
  // Validate before queueing, and never log a URL containing a temporary token.
  try {
    cloud.parseActivation(value);
  } catch {
    return;
  }
  queue = queue
    .then(async () => {
      await app.whenReady();
      if (!service) throw Error('Cloud ainda não configurado.');
      const answer = await dialog.showMessageBox({
        type: 'question',
        message: 'Ativar esta instalação do JARVIS?',
        detail: 'O código recebido vinculará este computador ao funcionário autorizado.',
        buttons: ['Cancelar', 'Ativar'],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer.response !== 1) return;
      await activate(value);
      await dialog.showMessageBox({ message: 'JARVIS ativado. Você já pode conversar.' });
    })
    .catch(() =>
      dialog.showErrorBox(
        'JARVIS — ativação',
        'Ativação indisponível. Confira o link, a conexão e a configuração do Cloud.',
      ),
    );
}
app.on('open-url', (event, value) => {
  event.preventDefault();
  receive(value);
});
app.on('second-instance', (_event, args) => {
  for (const value of args) if (value.startsWith('jarvis:')) receive(value);
});
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
    const saved = await service.load();
    if (saved) {
      await service.refresh().catch(() => {});
      await publish(service.current());
      if (service.state().status !== 'revoked') await unlock();
    }
    const monitor = setInterval(
      async () => {
        if (!service.current()) return;
        await service.refresh().catch(() => {});
        if (service.state().status === 'active') await publish(service.current()).catch(() => {});
        for (const window of BrowserWindow.getAllWindows())
          window.webContents.send('jarvis:cloud-state-changed', service.state());
      },
      15 * 60 * 1000,
    );
    monitor.unref();
    if (app.isPackaged) app.setAsDefaultProtocolClient('jarvis');
    else
      app.setAsDefaultProtocolClient('jarvis', process.execPath, [path.resolve(__dirname, '..')]);
    for (const value of process.argv) if (value.startsWith('jarvis:')) receive(value);
  })
  .catch(() =>
    dialog.showErrorBox(
      'JARVIS Cloud',
      'Configure a origem Cloud HTTPS. A chave OpenAI pertence somente ao servidor.',
    ),
  );
require('../main.js');

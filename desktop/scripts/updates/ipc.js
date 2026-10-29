const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { createUpdater } = require('./client');
function signature(file) {
  return new Promise((resolve, reject) =>
    execFile(
      path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$s=Get-AuthenticodeSignature -LiteralPath $env:CYRO_UPDATE_FILE; [Console]::Write($s.Status.ToString())',
      ],
      { windowsHide: true, timeout: 30000, env: { ...process.env, CYRO_UPDATE_FILE: file } },
      (error, stdout) =>
        error ? reject(Error('Verificação de assinatura indisponível.')) : resolve(stdout.trim()),
    ),
  );
}
function installUpdateIPC({ electron, service, origin, dataDir }) {
  const { app, BrowserWindow, ipcMain, shell } = electron;
  const mainPage = pathToFileURL(path.resolve(__dirname, '../../index.html')).href;
  function trusted(event) {
    return (
      app.isPackaged &&
      event.senderFrame === event.sender.mainFrame &&
      event.senderFrame.url === mainPage &&
      service()?.current()
    );
  }
  const updater = createUpdater({
    version: app.getVersion(),
    origin,
    directory: path.join(dataDir, 'updates'),
    authorize: (id) => service().request('/api/updates/download', 'POST', { id }),
    verifySignature: signature,
    notify: (value) => {
      for (const window of BrowserWindow.getAllWindows())
        if (window.webContents.getURL() === mainPage)
          window.webContents.send('cyro:updates-state', value);
    },
    openLink: (url) => shell.openExternal(url),
    install: (file) =>
      new Promise((resolve) => {
        if (!app.emit('cyro:install-update', file, resolve)) resolve(false);
      }),
  });
  for (const action of ['state', 'check', 'download', 'install', 'manual'])
    ipcMain.handle('cyro:updates-' + action, async (event) => {
      if (
        !app.isPackaged &&
        event.senderFrame === event.sender.mainFrame &&
        event.senderFrame.url === mainPage
      )
        return { phase: 'disabled', installedVersion: app.getVersion() };
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      try {
        return await updater[action]();
      } catch (error) {
        return { ...updater.state(), error: error.message };
      }
    });
  let checkedAt = 0;
  const check = () => {
    if (app.isPackaged && service()?.current() && Date.now() - checkedAt >= 6 * 3600_000) {
      checkedAt = Date.now();
      void updater.check();
    }
  };
  app.on('jarvis:session-changed', (active) => {
    if (active) check();
  });
  const timer = setInterval(check, 6 * 3600_000);
  timer.unref();
  app.on('before-quit', () => clearInterval(timer));
  check();
  return updater;
}
module.exports = { installUpdateIPC, signature };

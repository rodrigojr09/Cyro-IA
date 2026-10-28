const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const core = require('./manager');

function install({ electron, dataDir, stateStorage, mainWindow, quickWindows, authenticated }) {
  const file = path.join(dataDir, 'config', 'clipboard-settings.json');
  let config = core.defaults;
  try {
    if (!fs.lstatSync(file).isSymbolicLink())
      config = core.settings(
        stateStorage ? stateStorage.readJSON(file) : JSON.parse(fs.readFileSync(file, 'utf8')),
      );
  } catch {}
  const icon = core.overlay(electron.nativeImage),
    audio = core.chime();
  function windows() {
    return { main: mainWindow(), ...quickWindows() };
  }
  function broadcast(value) {
    const all = windows();
    if (all.main && !all.main.isDestroyed()) {
      if (process.platform === 'win32')
        all.main.setOverlayIcon(
          value.pending ? icon : null,
          value.pending ? 'Conteúdo copiado disponível' : '',
        );
    }
    for (const window of Object.values(all))
      if (window && !window.isDestroyed()) window.webContents.send('clipboard:state', value);
  }
  const manager = core.createClipboardManager({
    clipboard: electron.clipboard,
    nativeImage: electron.nativeImage,
    config,
    changed: broadcast,
    sound(volume) {
      const window = mainWindow();
      if (window && !window.isDestroyed())
        window.webContents.send('clipboard:sound', { source: audio, volume });
    },
  });
  const watched = new WeakSet();
  function role(event) {
    if (!authenticated() || event.senderFrame !== event.sender.mainFrame)
      throw Error('Solicitação não autorizada.');
    for (const [kind, window] of Object.entries(windows())) {
      const url =
        pathToFileURL(path.join(DESKTOP_ROOT, kind === 'main' ? 'index.html' : 'quick.html')).href +
        (kind === 'main' ? '' : '?panel=' + kind);
      if (window && event.sender === window.webContents && event.senderFrame.url === url) {
        if (!watched.has(event.sender)) {
          watched.add(event.sender);
          const release = () => {
            const owner = kind === 'main' ? 'main' : kind === 'composer' ? 'quick' : null;
            const id = manager.state().owned[owner];
            if (id) manager.dismiss(owner, id);
          };
          event.sender.on?.('render-process-gone', release);
          event.sender.on?.('destroyed', release);
        }
        return kind;
      }
    }
    throw Error('Solicitação não autorizada.');
  }
  electron.ipcMain.handle('clipboard:state', (event) => {
    role(event);
    return manager.state();
  });
  electron.ipcMain.handle('clipboard:ignore-own-copy', (event, text) => {
    if (!['main', 'composer', 'response'].includes(role(event)))
      throw Error('Solicitação não autorizada.');
    return manager.ignoreText(text);
  });
  electron.ipcMain.handle('clipboard:configure', (event, value) => {
    if (role(event) !== 'main') throw Error('Solicitação não autorizada.');
    const next = core.settings({ ...manager.state().settings, ...value });
    // Persist only explicit preferences, never notification metadata or content.
    if (stateStorage) stateStorage.writeJSON(file, next);
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
        throw Error('Configuração inválida.');
      const temporary = file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
      try {
        fs.renameSync(temporary, file);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    }
    return manager.configure(next);
  });
  electron.ipcMain.handle('clipboard:claim', (event, replaceId) => {
    const kind = role(event),
      window = windows()[kind];
    if (!['main', 'composer'].includes(kind) || !window.isVisible() || window.isMinimized())
      return { ok: false, reason: 'NOT_ACTIVE_CHAT' };
    // An open Quick Chat receives copies even while the user works in another app.
    // No focus/show call: eligibility is decided exclusively by native window state.
    const quick = windows().composer;
    const quickOpen = quick && !quick.isDestroyed() && quick.isVisible() && !quick.isMinimized();
    if (kind === 'main' && quickOpen) return { ok: false, reason: 'QUICK_CHAT_OPEN' };
    if (kind === 'main' && !window.isFocused() && !event.sender.isFocused?.())
      return { ok: false, reason: 'NOT_ACTIVE_CHAT' };
    return manager.claim(kind === 'main' ? 'main' : 'quick', replaceId);
  });
  electron.ipcMain.handle('clipboard:dismiss', (event, id) => {
    const kind = role(event);
    if (!['main', 'composer'].includes(kind) || typeof id !== 'string' || id.length > 64)
      throw Error('Solicitação não autorizada.');
    return manager.dismiss(kind === 'main' ? 'main' : 'quick', id);
  });
  electron.ipcMain.handle('clipboard:discard', (event) => {
    if (role(event) !== 'main') throw Error('Solicitação não autorizada.');
    manager.discardPending();
  });
  electron.ipcMain.handle('clipboard:open-link', async (event, id) => {
    const kind = role(event);
    if (!['main', 'composer'].includes(kind)) throw Error('Solicitação não autorizada.');
    const url = manager.link(kind === 'main' ? 'main' : 'quick', id);
    if (!url) throw Error('Link indisponível ou inválido.');
    const decision = await electron.dialog.showMessageBox(windows()[kind], {
      type: 'question',
      message: 'Abrir link no navegador?',
      detail: url,
      buttons: ['Cancelar', 'Abrir'],
      defaultId: 0,
      cancelId: 0,
    });
    if (decision.response !== 1) return false;
    // The claim may have expired or been cleared while the confirmation was open.
    if (!authenticated() || manager.link(kind === 'main' ? 'main' : 'quick', id) !== url)
      throw Error('Link indisponível ou inválido.');
    await electron.shell.openExternal(url);
    return true;
  });
  return manager;
}
module.exports = { install };

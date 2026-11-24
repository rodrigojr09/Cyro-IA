const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const localPage = resolve(__dirname, '../../index.html');
const loginPage = resolve(__dirname, '../../login.html');
const quickPage = resolve(__dirname, '../../quick.html');
const localURL = pathToFileURL(localPage).href;
const loginURL = pathToFileURL(loginPage).href;
const quickURL = pathToFileURL(quickPage).href;
const productionURL = 'https://web.cyro-ia.tech/';
const developmentURL = 'http://127.0.0.1:3000/';
const windows = new WeakMap();

function originFor({ packaged, cloud, webDevelopment }) {
  return cloud && packaged ? productionURL : cloud && webDevelopment ? developmentURL : null;
}

function registerWorkspace(win, options) {
  windows.set(win.webContents, {
    role: 'main', remote: originFor(options), generation: 0, unavailable: options.unavailable,
  });
}

function registerQuick(win, kind, options) {
  windows.set(win.webContents, { role: kind, remote: originFor(options), generation: 0 });
}

function isPage(contents, frame, role, local, route) {
  if (!frame || frame !== contents?.mainFrame) return false;
  const page = windows.get(contents);
  if (page && page.role !== role) return false;
  if (!page?.remote) return frame.url === local;
  const remote = new URL(route, page.remote);
  return frame.url === remote.href && frame.origin === remote.origin;
}

function isWorkspaceFrame(contents, frame) {
  return isPage(contents, frame, 'main', localURL, '/');
}

function isWorkspaceEvent(event) {
  return isWorkspaceFrame(event.sender, event.senderFrame);
}

function isWorkspaceContents(contents) {
  return isWorkspaceFrame(contents, contents?.mainFrame);
}

function isLoginContents(contents) {
  return isPage(contents, contents?.mainFrame, 'main', loginURL, '/entrar');
}

function isQuickEvent(event, kind) {
  return isPage(event.sender, event.senderFrame, kind, quickURL + '?panel=' + kind, '/rapido?panel=' + kind);
}

async function navigate(win, route, local, options) {
  const page = windows.get(win.webContents);
  if (!page?.remote) {
    if (page) ++page.generation;
    return win.loadFile(local, options);
  }
  const generation = ++page.generation;
  const contents = win.webContents;
  while (page.generation === generation && !win.isDestroyed()) {
    if (await loadHosted(win, contents, new URL(route, page.remote).href)) return true;
    if (page.generation !== generation || win.isDestroyed() || !page.unavailable) return false;
    if (!(await page.unavailable(win))) return false;
  }
  return false;
}

async function loadHosted(win, contents, url) {
  let timer, onNavigate;
  try {
    await Promise.race([
      new Promise((_, reject) => {
        onNavigate = (_event, _url, status) => {
          if (status >= 400) reject(Error('Interface web indisponível.'));
        };
        contents.on('did-navigate', onNavigate);
        timer = setTimeout(() => reject(Error('Tempo de carregamento excedido.')), 20000);
      }),
      win.loadURL(url),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    if (onNavigate) contents.removeListener('did-navigate', onNavigate);
  }
}

module.exports = {
  registerWorkspace, registerQuick, isWorkspaceEvent, isWorkspaceContents, isLoginContents, isQuickEvent,
  openWorkspace: (win) => navigate(win, '/', localPage),
  showLogin: (win) => navigate(win, '/entrar', loginPage),
  openQuick: (win, kind) => navigate(win, '/rapido?panel=' + kind, quickPage, { query: { panel: kind } }),
  isRegisteredWorkspace: (contents) => windows.get(contents)?.role === 'main',
};

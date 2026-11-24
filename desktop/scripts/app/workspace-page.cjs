const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const localPage = resolve(__dirname, '../../index.html');
const loginPage = resolve(__dirname, '../../login.html');
const localURL = pathToFileURL(localPage).href;
const loginURL = pathToFileURL(loginPage).href;
const productionURL = 'https://web.cyro-ia.tech/';
const developmentURL = 'http://127.0.0.1:3000/';
const windows = new WeakMap();

function registerWorkspace(win, { packaged, cloud, webDevelopment }) {
  const remote = cloud && packaged ? productionURL : cloud && webDevelopment ? developmentURL : null;
  windows.set(win.webContents, { remote, generation: 0 });
}

function isWorkspaceFrame(contents, frame) {
  if (!frame || frame !== contents?.mainFrame) return false;
  if (frame.url === localURL) return true;
  const remote = windows.get(contents)?.remote;
  return !!remote && frame.url === remote && frame.origin === new URL(remote).origin;
}

function isWorkspaceEvent(event) {
  return isWorkspaceFrame(event.sender, event.senderFrame);
}

function isWorkspaceContents(contents) {
  return isWorkspaceFrame(contents, contents?.mainFrame);
}

async function openWorkspace(win) {
  const page = windows.get(win.webContents);
  if (!page?.remote) return win.loadFile(localPage);
  const generation = ++page.generation;
  const contents = win.webContents;
  let timer, onNavigate;
  try {
    await Promise.race([
      win.loadURL(page.remote),
      new Promise((_, reject) => {
        onNavigate = (_event, _url, status) => {
          if (status >= 400) reject(Error('Interface web indisponível.'));
        };
        contents.on('did-navigate', onNavigate);
        timer = setTimeout(() => reject(Error('Tempo de carregamento excedido.')), 20000);
      }),
    ]);
  } catch {
    if (page.generation === generation && !win.isDestroyed()) await win.loadFile(localPage);
  } finally {
    clearTimeout(timer);
    if (onNavigate) contents.removeListener('did-navigate', onNavigate);
  }
}

function showLogin(win) {
  const page = windows.get(win.webContents);
  if (page) ++page.generation;
  return win.loadFile(loginPage);
}

module.exports = {
  registerWorkspace, isWorkspaceEvent, isWorkspaceContents, openWorkspace,
  showLogin, loginURL, isRegisteredWorkspace: (contents) => windows.has(contents),
};

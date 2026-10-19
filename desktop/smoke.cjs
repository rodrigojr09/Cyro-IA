// Teste real do renderizador Electron com dados fictícios e sem chamadas de rede.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
app.disableHardwareAcceleration();
let win;
let copied;
let speech;
let submittedMode;
const timer = setTimeout(() => { console.error('Tempo de teste Electron excedido.'); app.exit(1); }, 30000);
const project = { progress: 'Pronto', project: { name: 'iPet', path: 'C:\\Fixtures\\iPet' },
  roots: [{ name: 'Fixtures', path: 'C:\\Fixtures' }] };
ipcMain.handle('jarvis:api', (_, route, options) => {
  if (route === '/health') return { ok: true, data: { ok: true } };
  if (route === '/history') return { ok: true, data: [] };
  if (route === '/programming/status') return { ok: true, data: project };
  if (route === '/chat') {
    submittedMode = JSON.parse(options.body).mode;
    return { ok: true, data: { reply: 'Hipótese em backend/index.ts:2. Aplique manualmente:\n```ts\nconst users = await getUsers();\n// <script> não deve ser interpretado como HTML\n```\nNenhum arquivo foi alterado.',
      speech_text: 'Revise a chamada assíncrona. O exemplo está no chat.', pending_actions: [], programming: project } };
  }
  if (route === '/speak') {
    speech = JSON.parse(options.body).message;
    return { ok: false, data: { detail: 'Voz simulada no teste.' } };
  }
  throw new Error('Rota inesperada no teste: ' + route);
});
ipcMain.handle('jarvis:copy-code', (_, text) => { copied = text; return true; });
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ width: 390, height: 540, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true,
        contextIsolation: true, nodeIntegration: false, offscreen: true } });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await win.webContents.executeJavaScript(`new Promise(resolve => {
      const check = () => document.getElementById('project-name').textContent.includes('iPet') ? resolve() : setTimeout(check, 25);
      check();
    })`);
    await win.webContents.executeJavaScript(`(async () => {
      document.getElementById('input').value = 'Analise o login de iPet';
      await document.getElementById('send').onclick();
      await document.querySelector('.code-block button').onclick();
    })()`);
    const actual = await win.webContents.executeJavaScript(`({
      code: document.querySelector('pre code').textContent,
      scriptCount: document.querySelectorAll('#messages script').length,
      mode: document.getElementById('programming-mode').checked,
      hiddenComputer: getComputedStyle(document.getElementById('computer-controls')).display,
      messageHeight: document.getElementById('messages').getBoundingClientRect().height,
      bodyHeight: document.body.scrollHeight,
      viewportHeight: innerHeight
    })`);
    assert.equal(submittedMode, 'programming');
    assert.equal(actual.mode, true);
    assert.equal(actual.scriptCount, 0);
    assert.equal(actual.hiddenComputer, 'none');
    assert.ok(actual.messageHeight > 120);
    assert.ok(actual.bodyHeight <= actual.viewportHeight + 2);
    assert.equal(copied, actual.code);
    assert.equal(speech, 'Revise a chamada assíncrona. O exemplo está no chat.');
    const screenshot = await win.webContents.capturePage();
    const destination = path.join(app.getPath('temp'), 'jarvis-v03-smoke.png');
    await fs.writeFile(destination, screenshot.toPNG());
    console.log('Electron real: modo somente leitura, chat, código, cópia, resumo de voz e layout aprovados.');
    console.log('Captura: ' + destination);
    clearTimeout(timer);
    win.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    clearTimeout(timer);
    if (win) win.destroy();
    app.exit(1);
  }
});

// Real Electron + preload/IPC + FastAPI + SQLite/export; editorial provider is synthetic.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-writer-smoke-'));
app.setPath('userData', path.join(directory, 'profile'));
let window, child;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const watchdog = setTimeout(() => finish(1, 'Writer smoke excedeu 90 segundos.'), 90000);
function finish(code, message) {
  clearTimeout(watchdog);
  child?.kill();
  window?.destroy();
  console[code ? 'error' : 'log'](message);
  app.exit(code);
}
app.whenReady().then(async () => {
  try {
    const listener = net.createServer();
    await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const token = randomUUID();
    ipcMain.handle('clipboard:claim', () => ({ status: 'empty' }));
    ipcMain.handle('clipboard:state', () => ({ pending: false, config: { enabled: false } }));
    child = spawn(
      'python',
      [path.join(__dirname, '../backend/writer_smoke_server.py'), directory, String(port)],
      {
        windowsHide: true,
        env: { ...process.env, WRITER_TEST_TOKEN: token },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    const boot = await new Promise((resolve, reject) => {
      child.stdout.on('data', (data) => {
        output += data;
        if (output.includes('\n')) {
          try {
            resolve(JSON.parse(output.split('\n')[0]));
          } catch (error) {
            reject(error);
          }
        }
      });
      child.on('error', reject);
      child.on('exit', (code) => reject(Error('Backend teste terminou: ' + code)));
    });
    const backend = async (route, method, body) => {
      const response = await fetch('http://127.0.0.1:' + port + route, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': token },
        body,
      });
      return { ok: response.ok, data: await response.json() };
    };
    for (let i = 0; i < 60; i++) {
      try {
        await backend(
          '/writer',
          'POST',
          JSON.stringify({ project_id: boot.project.id, action: 'open' }),
        );
        break;
      } catch {
        await pause(100);
      }
    }
    for (const name of [
      'jarvis:initial-settings',
      'jarvis:voice-preference',
      'jarvis:cloud-state',
      'jarvis:quick-settings',
      'jarvis:api',
    ])
      ipcMain.handle(name, () =>
        name === 'jarvis:api' ? { ok: true, data: { projects: [], chats: [], messages: [] } } : {},
      );
    window = new BrowserWindow({
      width: 1366,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    require('./writer-ipc').install({
      ipcMain,
      trusted: (event) =>
        event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame,
      mainWindow: () => window,
      backend,
      dialog: {
        showSaveDialog: async () => ({
          canceled: false,
          filePath: path.join(directory, 'Livro.docx'),
        }),
      },
    });
    await window.loadFile(path.join(__dirname, 'index.html'));
    const execute = (code) => window.webContents.executeJavaScript(code, true);
    await execute(
      `window.jarvisWorkspace={project:${JSON.stringify({ id: boot.project.id, name: boot.project.name })}};window.jarvisWriterUI.open()`,
    );
    assert.equal(await execute('document.getElementById("writer-dialog").open'), true);
    await execute(`document.getElementById('writer-edit').click()`);
    await pause(100);
    await execute(
      `(()=>{const field=document.querySelector('#writer-paper textarea');field.value='Lucas abriu a porta. Sua mão tremia.';field.dispatchEvent(new Event('input',{bubbles:true}));return window.jarvisWriterUI.flush();})()`,
    );
    await execute(`document.getElementById('writer-edit').click()`);
    await pause(100);
    await execute(
      `document.getElementById('writer-input').value='Deixe o trecho mais misterioso.';document.getElementById('writer-send').click()`,
    );
    for (let i = 0; i < 80; i++) {
      if (await execute(`!document.getElementById('writer-proposal').hidden`)) break;
      await pause(100);
    }
    assert.equal(await execute(`!!document.querySelector('#writer-paper mark')`), true);
    assert.match(await execute(`window.jarvisWriterUI.active.blocks[0].text`), /Sua mão tremia/);
    window.show();
    await pause(500);
    const screenshot = path.join(directory, 'writer-preview.png');
    fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
    await execute(`document.getElementById('writer-approve').click()`);
    await pause(300);
    assert.match(await execute(`window.jarvisWriterUI.active.blocks[0].text`), /lentamente/);
    await execute(`document.getElementById('writer-undo').click()`);
    await pause(300);
    assert.match(await execute(`window.jarvisWriterUI.active.blocks[0].text`), /Sua mão tremia/);
    await execute(`document.getElementById('writer-export').click()`);
    await pause(100);
    await execute(`document.getElementById('writer-export-save').click()`);
    await pause(500);
    assert.equal(
      fs.readFileSync(path.join(directory, 'Livro.docx')).subarray(0, 2).toString(),
      'PK',
    );
    await execute(`document.getElementById('writer-close').click()`);
    await pause(100);
    await execute('window.jarvisWriterUI.open()');
    assert.match(await execute(`window.jarvisWriterUI.active.blocks[0].text`), /Sua mão tremia/);
    await execute(`document.getElementById('writer-new').click()`);
    await pause(100);
    await execute(
      `document.getElementById('writer-prompt-value').value='Capítulo escolhido';document.querySelector('#writer-prompt form').requestSubmit(document.querySelector('#writer-prompt button[value="ok"]'))`,
    );
    await pause(200);
    assert.equal(await execute('window.jarvisWriterUI.active.title'), 'Capítulo escolhido.docx');
    finish(
      0,
      'Writer: Electron real + IPC + API + SQLite + edição/reabertura + diff/aprovação/desfazer + DOCX OK. IA sintética. QA: ' +
        directory,
    );
  } catch (error) {
    finish(1, error.stack || String(error));
  }
});

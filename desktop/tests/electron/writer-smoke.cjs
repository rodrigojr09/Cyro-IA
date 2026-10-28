require('electron').ipcMain.handle('jarvis:workspace-ready', () => true);
const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
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
const testChats = [];
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
      [path.join(DESKTOP_ROOT, '../backend/writer_smoke_server.py'), directory, String(port)],
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
      const result = { ok: response.ok, data: await response.json() };
      if (result.ok && result.data?.writer_document_id) {
        const index = testChats.findIndex((chat) => chat.id === result.data.id);
        if (index < 0) testChats.push(result.data);
        else testChats[index] = result.data;
      }
      return result;
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

    const bound = await backend(
      '/writer',
      'POST',
      JSON.stringify({
        project_id: boot.project.id,
        action: 'bind_chat',
        payload: { id: boot.document },
      }),
    );
    assert(bound.ok);
    ipcMain.handle('jarvis:initial-settings', () => ({ voice: false }));
    ipcMain.handle('jarvis:voice-preference', () => {});
    ipcMain.handle('jarvis:api', (_, route, options) => {
      if (route === '/storage')
        return {
          ok: true,
          data: {
            local: { usedBytes: 1 },
            cloud: { usedBytes: 0, limitBytes: 52428800, blocked: false },
          },
        };
      if (route === '/workspace/view')
        return {
          ok: true,
          data: {
            project: JSON.parse(options.body).project_id ? boot.project : null,
            chats: [],
            archived_chats: [],
          },
        };
      if (
        route === '/workspace' ||
        route === '/workspace/bootstrap' ||
        route === '/workspace/progress'
      )
        return {
          ok: true,
          data: {
            projects: [boot.project],
            chats: testChats,
            histories: Object.fromEntries(testChats.map((chat) => [chat.id, []])),
          },
        };
      if (route.startsWith('/chats/history?')) {
        const id = new URLSearchParams(route.split('?')[1]).get('chat_id');
        return { ok: true, data: { chat: testChats.find((item) => item.id === id), messages: [] } };
      }
      throw Error('Unexpected renderer route ' + route);
    });
    window = new BrowserWindow({
      width: 1366,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(DESKTOP_ROOT, 'scripts/app/preload.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    require('../../scripts/writer/ipc').install({
      ipcMain,
      trusted: (event) =>
        event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame,
      mainWindow: () => window,
      backend,
      dialog: {
        showOpenDialog: async () => ({
          canceled: false,
          filePaths: [path.join(directory, 'Original.txt')],
        }),
        showSaveDialog: async () => ({
          canceled: false,
          filePath: path.join(directory, 'Livro.docx'),
        }),
      },
    });
    const execute = (code) => window.webContents.executeJavaScript(code, true);
    const waitFor = async (condition) => {
      for (let i = 0; i < 120; i++) {
        if (await execute(condition)) return;
        await pause(50);
      }
      throw Error(
        'Writer React timeout ' +
          condition +
          ' / ' +
          (await execute('document.getElementById("status").textContent')),
      );
    };
    const enter = async (selector, value) => {
      await execute(
        `(()=>{const field=document.querySelector(${JSON.stringify(selector)});const kind=field.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(kind.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await pause(30);
    };
    const getDocument = async (id) => {
      const result = await backend(
        '/writer',
        'POST',
        JSON.stringify({ project_id: boot.project.id, action: 'get', payload: { id } }),
      );
      assert(result.ok, JSON.stringify(result.data));
      return result.data;
    };
    await window.loadFile(path.join(DESKTOP_ROOT, 'index.html'));
    await waitFor(`document.getElementById('status')?.textContent==='Conectado'`);
    await execute(
      `document.querySelector('.project-toggle').click();document.querySelector('.project-item').click()`,
    );
    await pause(60);
    await execute(`document.querySelector('.chat-item').click()`);
    await waitFor(
      `document.getElementById('writer-paper')?.textContent.includes('Lucas abriu a porta.')`,
    );
    assert.equal(await execute(`typeof require`), 'undefined');
    await waitFor(`!document.getElementById('writer-edit').disabled`);
    await execute(`document.getElementById('writer-edit').click()`);
    await waitFor(`!!document.querySelector('#writer-paper textarea')`);
    await enter('#writer-paper textarea', 'Lucas abriu a porta. Sua mão tremia.');
    await waitFor(`document.getElementById('writer-save-state').textContent==='Salvo'`);
    assert.equal(
      (await getDocument(boot.document)).blocks[0].text,
      'Lucas abriu a porta. Sua mão tremia.',
    );
    await waitFor(`!document.getElementById('writer-edit').disabled`);
    await execute(`document.getElementById('writer-edit').click()`);
    await waitFor(`!document.querySelector('#writer-paper textarea')`);
    await enter('#input', 'Deixe o trecho mais misterioso.');
    await execute(`document.getElementById('send').click()`);
    await waitFor(`!!document.querySelector('.writer-change mark')`);
    assert.equal(
      (await getDocument(boot.document)).blocks[0].text,
      'Lucas abriu a porta. Sua mão tremia.',
    );
    fs.writeFileSync(
      path.join(directory, 'writer-proposal.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    await execute(`document.getElementById('writer-approve').click()`);
    await waitFor(
      `!document.getElementById('writer-proposal') && document.getElementById('writer-paper').textContent.includes('lentamente')`,
    );
    assert.match((await getDocument(boot.document)).blocks[0].text, /lentamente/);
    await execute(`document.getElementById('writer-undo').click()`);
    await waitFor(`document.getElementById('writer-paper').textContent.includes('Sua mão tremia')`);
    await execute(`document.getElementById('writer-redo').click()`);
    await waitFor(`document.getElementById('writer-paper').textContent.includes('lentamente')`);
    await enter('#input', 'Quem abriu a porta?');
    await execute(`document.getElementById('send').click()`);
    await waitFor(
      `document.getElementById('messages').textContent.includes('Lucas abriu a porta.')&&!document.getElementById('send').disabled`,
    );
    assert.equal(await execute(`!!document.getElementById('writer-proposal')`), false);
    await enter('#input', 'Deixe o trecho mais misterioso.');
    await execute(`document.getElementById('send').click()`);
    await waitFor(`!!document.getElementById('writer-proposal')`);
    const external = await getDocument(boot.document);
    const externalSave = await backend(
      '/writer',
      'POST',
      JSON.stringify({
        project_id: boot.project.id,
        action: 'save',
        payload: {
          id: external.id,
          base_version: external.version,
          request_id: randomUUID(),
          blocks: external.blocks.map((block) => ({
            ...block,
            text: 'Edição externa preservada.',
          })),
        },
      }),
    );
    assert(externalSave.ok);
    await execute(`document.getElementById('writer-approve').click()`);
    await waitFor(`document.getElementById('writer-countdown')?.textContent.includes('Conflito')`);
    assert.equal((await getDocument(boot.document)).blocks[0].text, 'Edição externa preservada.');
    await execute(`document.getElementById('writer-reload').click()`);
    await waitFor(
      `document.getElementById('writer-paper').textContent.includes('Edição externa preservada.')`,
    );
    await execute(`document.getElementById('writer-export').click()`);
    await waitFor(`document.getElementById('writer-export-dialog').open`);
    assert.ok(await execute(`document.querySelectorAll('#writer-export-items input').length>0`));
    await execute(`document.getElementById('writer-export-docx').click()`);
    await waitFor(`!document.getElementById('writer-export-dialog').open`);
    assert.equal(
      fs.readFileSync(path.join(directory, 'Livro.docx')).subarray(0, 2).toString(),
      'PK',
    );
    fs.writeFileSync(path.join(directory, 'Original.txt'), 'Arquivo original autorizado.');
    await execute(`document.getElementById('project-writer').click()`);
    await waitFor(`document.getElementById('writer-file-choice').open`);
    await execute(`document.getElementById('writer-choose-file').click()`);
    await waitFor(
      `document.getElementById('writer-paper').textContent.includes('Arquivo original autorizado.')`,
    );
    await waitFor(`!document.getElementById('writer-edit').disabled`);
    await execute(`document.getElementById('writer-edit').click()`);
    await waitFor(`!!document.querySelector('#writer-paper textarea')`);
    await enter('#writer-paper textarea', 'Arquivo original autorizado e editado manualmente.');
    await waitFor(
      `!document.getElementById('writer-save-state').textContent.includes('Salvando') && !document.getElementById('writer-save-state').textContent.includes('pendente')`,
    );
    await execute(`document.getElementById('writer-save-file').click()`);
    for (
      let attempt = 0;
      attempt < 100 &&
      !fs
        .readFileSync(path.join(directory, 'Original.txt'), 'utf8')
        .includes('editado manualmente');
      attempt++
    )
      await pause(30);
    assert.match(
      fs.readFileSync(path.join(directory, 'Original.txt'), 'utf8'),
      /editado manualmente/,
    );
    finish(
      0,
      'Writer React + Electron + IPC + FastAPI/SQLite: edição manual, salvamento, prévia sem aplicar, aprovação, desfazer/refazer, pergunta sem edição, conflito externo, recuperação, exportação DOCX e arquivo original autorizado aprovados. IA sintética. Capturas: ' +
        directory,
    );
  } catch (error) {
    finish(1, error.stack);
  }
});

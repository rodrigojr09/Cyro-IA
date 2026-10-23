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
    await window.loadFile(path.join(__dirname, 'index.html'));
    const execute = (code) => window.webContents.executeJavaScript(code, true);
    const waitFor = async (condition) => {
      for (let i = 0; i < 100; i++) {
        if (await execute(condition)) return;
        await pause(80);
      }
      throw Error(
        'Condição não alcançada: ' +
          condition +
          ' Status: ' +
          (await execute('document.getElementById("status").textContent')),
      );
    };
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
    await execute(
      'window.jarvisWorkspace={project:' +
        JSON.stringify(boot.project) +
        ',chat:' +
        JSON.stringify(bound.data) +
        ',begin(){},end(){},async catalog(project,id){const r=await window.jarvisWriter.command({project_id:project,action:"open",payload:{}});const node=r.data.nodes.find(n=>n.id===window.testImportedDocument);this.chat={id,writer_document_id:node.id};await window.jarvisWriterUI.mount(this.project,this.chat);}};window.jarvisWriterUI.mount(window.jarvisWorkspace.project,window.jarvisWorkspace.chat)',
    );
    assert.equal(await execute('document.getElementById("writer-dialog").open'), false);
    assert.equal(await execute('document.getElementById("writer-preview-pane").hidden'), false);
    assert.equal(await execute('!!document.getElementById("new-chat")'), false);
    await execute('document.getElementById("writer-edit").click()');
    await waitFor('!!document.querySelector("#writer-paper textarea")');
    assert.equal(
      await execute(
        '(()=>{const t=document.querySelector("#writer-paper textarea"),p=document.getElementById("writer-paper");return t.getBoundingClientRect().width > p.clientWidth*.7 && getComputedStyle(t).color === "rgb(23, 43, 58)";})()',
      ),
      true,
    );
    await execute(
      '(()=>{const t=document.querySelector("#writer-paper textarea");t.focus();t.setSelectionRange(0,5);t.dispatchEvent(new Event("select"));document.getElementById("input").focus();})()',
    );
    assert.equal(
      await execute('!!document.querySelector(".writer-block-editor.writer-selected")'),
      true,
    );
    await execute('document.getElementById("writer-selection").click()');
    assert.equal(
      await execute('document.getElementById("writer-selection").textContent'),
      'Documento inteiro',
    );
    window.showInactive();
    await pause(300);
    fs.writeFileSync(
      path.join(directory, 'writer-editor.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    await execute(
      '(()=>{const field=document.querySelector("#writer-paper textarea");field.value="Lucas abriu a porta. Sua mão tremia.";field.dispatchEvent(new Event("input",{bubbles:true}));return window.jarvisWriterUI.flush();})()',
    );
    await execute('document.getElementById("writer-edit").click()');
    await waitFor('!document.querySelector("#writer-paper textarea")');
    await execute(
      'document.getElementById("input").value="Deixe o trecho mais misterioso.";window.jarvisWriterUI.submit()',
    );
    await waitFor('!document.getElementById("writer-proposal").hidden');
    assert.equal(await execute('!!document.querySelector("#writer-paper mark")'), true);
    assert.equal(await execute('!!document.querySelector("#messages .message.user")'), true);
    assert.equal(await execute('!!document.querySelector("#send svg, #send i")'), true);
    window.showInactive();
    await pause(400);
    assert.equal(
      await execute(
        'document.getElementById("writer-preview-pane").getBoundingClientRect().width > 200',
      ),
      true,
    );
    const screenshot = path.join(directory, 'writer-integrated.png');
    fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
    await execute('document.getElementById("writer-approve").click()');
    await waitFor('window.jarvisWriterUI.active.blocks[0].text.includes("lentamente")');
    await execute('document.getElementById("writer-undo").click()');
    await waitFor('window.jarvisWriterUI.active.blocks[0].text.includes("Sua mão tremia")');
    await execute('window.jarvisWriterUI.unmount()');
    assert.equal(await execute('document.getElementById("writer-preview-pane").hidden'), true);
    await execute(
      'window.jarvisWriterUI.mount(window.jarvisWorkspace.project,window.jarvisWorkspace.chat)',
    );
    assert.match(await execute('window.jarvisWriterUI.active.blocks[0].text'), /Sua mão tremia/);
    const sourcePath = path.join(directory, 'Original.txt');
    fs.writeFileSync(sourcePath, 'Lucas abriu a porta.');
    const imported = await execute(
      'window.jarvisWriter.chooseFile({project_id:window.jarvisWorkspace.project.id,create:false})',
    );
    assert.equal(imported.chat.title, 'Original.txt');
    await execute('window.jarvisWriterUI.unmount();');
    await execute(
      'window.jarvisWorkspace.chat=' +
        JSON.stringify(imported.chat) +
        ';window.jarvisWriterUI.mount(window.jarvisWorkspace.project,window.jarvisWorkspace.chat)',
    );
    await execute(
      'document.getElementById("input").value="Quem abriu a porta?";window.jarvisWriterUI.submit()',
    );
    assert.equal(fs.readFileSync(sourcePath, 'utf8'), 'Lucas abriu a porta.');
    assert.equal(await execute('document.getElementById("writer-proposal").hidden'), true);
    assert.match(await execute('document.getElementById("messages").textContent'), /Lucas/);
    await execute(
      'document.getElementById("input").value="Deixe o trecho mais misterioso.";window.jarvisWriterUI.submit()',
    );
    assert.equal(fs.readFileSync(sourcePath, 'utf8'), 'Lucas abriu a porta.');
    await execute('document.getElementById("writer-approve").click()');
    await waitFor('document.getElementById("status").textContent.includes("original atualizado")');
    assert.match(fs.readFileSync(sourcePath, 'utf8'), /lentamente/);
    await execute(
      'document.getElementById("input").value="muito resumido";window.jarvisWriterUI.submit()',
    );
    assert.equal(await execute('document.getElementById("writer-proposal").hidden'), false);
    await execute(
      'document.getElementById("input").value="Quem abriu a porta?";window.jarvisWriterUI.submit()',
    );
    assert.match(fs.readFileSync(sourcePath, 'utf8'), /supervisão/);
    assert.equal(await execute('document.getElementById("writer-proposal").hidden'), true);
    await execute(
      'document.getElementById("input").value="Deixe o trecho mais misterioso.";window.jarvisWriterUI.submit()',
    );
    fs.writeFileSync(sourcePath, 'Alterado em outro programa.');
    await execute('document.getElementById("writer-approve").click()');
    await waitFor('document.getElementById("status").textContent.includes("outro programa")');
    assert.equal(fs.readFileSync(sourcePath, 'utf8'), 'Alterado em outro programa.');
    await execute('document.getElementById("writer-export").click()');
    await waitFor('document.getElementById("writer-export-dialog").open');
    await execute('document.getElementById("writer-export-save").click()');
    for (let i = 0; i < 80 && !fs.existsSync(path.join(directory, 'Livro.docx')); i++)
      await pause(80);
    assert.equal(
      fs.readFileSync(path.join(directory, 'Livro.docx')).subarray(0, 2).toString(),
      'PK',
    );
    finish(
      0,
      'Writer integrado: Electron real + IPC + API + SQLite + chat padrão/prévia/diff + pergunta sem edição + aprovação/salvamento original + conflito externo + reabertura/desfazer/exportação DOCX OK. IA sintética. QA: ' +
        directory,
    );
  } catch (error) {
    finish(1, error.stack || String(error));
  }
});

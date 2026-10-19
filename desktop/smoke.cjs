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
let submittedChat;
const projectId='11111111-1111-4111-8111-111111111111';
const generalId='22222222-2222-4222-8222-222222222222';
const firstId='33333333-3333-4333-8333-333333333333';
const secondId='44444444-4444-4444-8444-444444444444';
const chats=[{id:firstId,project_id:projectId,title:'Login',archived:0},{id:secondId,project_id:projectId,title:'Feed',archived:0}];
const timer = setTimeout(() => { console.error('Tempo de teste Electron excedido.'); app.exit(1); }, 30000);
const project = { progress: 'Pronto', project: { name: 'iPet', path: 'C:\\Fixtures\\iPet' },
  roots: [{ name: 'Fixtures', path: 'C:\\Fixtures' }] };
ipcMain.handle('jarvis:api', (_, route, options) => {
  const projectInfo={id:projectId,name:'iPet',path:'C:\\Fixtures\\iPet',state:'ready',ready:1,knowledge_version:2,progress:'Memória atualizada'};
  if(route==='/workspace')return {ok:true,data:{projects:[projectInfo],general_chat_id:generalId}};
  if(route==='/workspace/view')return {ok:true,data:JSON.parse(options.body).project_id ? {project:projectInfo,chats,archived_chats:[]} : {project:null,chats:[{id:generalId,project_id:null,title:'Geral',archived:0}],archived_chats:[]}};
  if(route.startsWith('/chats/history?')){
    const id=new URLSearchParams(route.split('?')[1]).get('chat_id');
    return {ok:true,data:{chat:chats.find(item=>item.id===id)||{id:generalId,project_id:null,title:'Geral'},messages:id===secondId?[{id:1,role:'user',content:'Assunto independente do feed'}]:[]}};
  }
  if(route==='/chats/create'){
    const chat={id:'55555555-5555-4555-8555-555555555555',project_id:projectId,title:'Nova conversa',archived:0};
    chats.push(chat);return {ok:true,data:chat};
  }
  if (route === '/health') return { ok: true, data: { ok: true } };
  if (route === '/history') return { ok: true, data: [] };
  if (route === '/programming/status') return { ok: true, data: project };
  if (route === '/chat') {
    submittedMode = JSON.parse(options.body).mode;
    submittedChat = JSON.parse(options.body).chat_id;
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
      const check = () => window.jarvisWorkspace.chat ? resolve() : setTimeout(check, 25);
      check();
    })`);
    await win.webContents.executeJavaScript(`(async()=>{document.getElementById('project-select').value='${projectId}';await document.getElementById('project-select').onchange();})()`);
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
    assert.equal(submittedChat,firstId);
    assert.equal(actual.mode, true);
    assert.equal(actual.scriptCount, 0);
    assert.equal(actual.hiddenComputer, 'none');
    assert.ok(actual.messageHeight > 120);
    assert.ok(actual.bodyHeight <= actual.viewportHeight + 2);
    assert.equal(copied, actual.code);
    assert.equal(speech, 'Revise a chamada assíncrona. O exemplo está no chat.');
    const screenshot = await win.webContents.capturePage();
    const destination = path.join(app.getPath('temp'), 'jarvis-v04-smoke.png');
    await fs.writeFile(destination, screenshot.toPNG());
    await win.webContents.executeJavaScript(`(async()=>{document.getElementById('chat-select').value='${secondId}';await document.getElementById('chat-select').onchange();})()`);
    assert.match(await win.webContents.executeJavaScript(`document.getElementById('messages').textContent`),/Assunto independente/);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('pre code').length`),0);
    await win.webContents.executeJavaScript(`document.getElementById('new-chat').onclick()`);
    assert.equal(await win.webContents.executeJavaScript(`window.jarvisWorkspace.chat.id`),'55555555-5555-4555-8555-555555555555');
    console.log('Electron real: projetos, múltiplos chats, memória, modo somente leitura, código, cópia, voz curta e layout aprovados.');
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

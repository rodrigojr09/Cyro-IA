const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

function setup({ authorized = false, canceled = false } = {}) {
  const handlers = new Map();
  const requests = [];
  const copies = [];
  const dialogs = [];
  const frame = { url: pathToFileURL(path.join(__dirname, 'index.html')).href };
  const contents = { mainFrame: frame, setWindowOpenHandler() {}, on() {} };
  class Window {
    constructor() { this.webContents = contents; }
    loadFile() {}
  }
  const electron = {
    dialog: {
      showOpenDialog: async (_, options) => { dialogs.push(options); return { canceled, filePaths: ['C:\\Projects'] }; },
      showMessageBox: async (_, options) => { dialogs.push(options); return { response: authorized ? 1 : 0 }; }
    },
    clipboard: { writeText: text => copies.push(text) },
    app: { disableHardwareAcceleration() {}, whenReady: () => ({ then: fn => fn() }), on() {} },
    BrowserWindow: Window,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8'), {
    __dirname, console, process: { on() {} }, AbortSignal,
    require: name => name === 'electron' ? electron : name === 'fs/promises'
      ? { readFile: async () => 'test-local-token' } : require(name),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ reply: 'Resposta' }) };
    }
  });
  return { invoke: handlers.get('jarvis:api'), handlers, copies, dialogs,
    event: { sender: contents, senderFrame: frame }, requests };
}

test('IPC permite somente a janela principal e rotas registradas', async () => {
  const { invoke, event, requests } = setup();
  await assert.rejects(invoke({ ...event, sender: {} }, '/history'));
  await assert.rejects(invoke({ ...event, senderFrame: { url: 'https://example.com' } }, '/history'));
  await assert.rejects(invoke(event, '/action/execute'));
  await assert.rejects(invoke(event, 'https://example.com'));
  assert.equal(requests.length, 0);
});

test('IPC fixa método, destino e token sem devolvê-lo ao renderizador', async () => {
  const { invoke, event, requests } = setup();
  await assert.rejects(invoke(event, '/history', { method: 'POST' }));
  const result = await invoke(event, '/chat', { method: 'POST', body: '{"message":"Olá"}' });
  assert.equal(requests[0].url, 'http://127.0.0.1:8765/chat');
  assert.equal(requests[0].options.headers['X-Jarvis-Token'], 'test-local-token');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(JSON.stringify(result).includes('test-local-token'), false);
});

test('IPC rejeita corpos inválidos e excessivos', async () => {
  const { invoke, event, requests } = setup();
  await assert.rejects(invoke(event, '/chat', { body: {} }));
  await assert.rejects(invoke(event, '/chat', { body: 'x'.repeat(30001) }));
  assert.equal(requests.length, 0);
});

async function rendererSetup({ programming = false, reply, speechSummary } = {}) {
  const requests = [];
  const timers = [];
  class Element {
    constructor() { this.children = []; this.value = ''; this.textContent = ''; this.disabled = false; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener() {}
    focus() {}
  }
  const elements = Object.fromEntries(['messages', 'input', 'send', 'status', 'minimize', 'close',
    'computer-run', 'computer-action', 'computer-controls', 'programming-mode', 'project-name',
    'authorized-roots', 'revoke-root', 'authorize-project'].map(id => [id, new Element()]));
  elements['programming-mode'].checked = programming;
  const copies = [];
  let plays = 0;
  const action = { confirmation_id: 'pending-test', description: 'Abrir aplicativo: Bloco de Notas', expires_in_seconds: 120 };
  const api = async (route, options) => {
    requests.push({ route, options });
    const data = route === '/history' ? [] : route === '/chat' ? {
      reply: reply || 'Aguardo confirmação.', speech_text: speechSummary, pending_actions: programming ? [] : [action],
      programming: { project: { name: 'iPet' }, roots: [{ name: 'Desktop', path: 'C:\\Desktop' }] }
    }
      : route === '/action/open' ? { pending_action: action }
      : route === '/action/confirm' ? { result: 'Ação processada.' }
      : route === '/speak' ? { audio_base64: 'bXAz' }
      : route === '/computer/processes' ? { total: 1, processes: [{ pid: 1, name: '<script>example</script>' }] }
      : route === '/programming/status' ? { progress: 'Lendo arquivo index.ts...', project: { name: 'iPet' }, roots: [{ name: 'Desktop', path: 'C:\\Desktop' }] }
      : { ok: true };
    return { ok: true, data };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8'), {
    document: { getElementById: id => elements[id], createElement: () => new Element() },
    window: { jarvisWindow: { api, minimize() {}, close() {}, copyCode: async text => copies.push(text),
      authorizeFolder: async () => ({ ok: true, data: {} }) } },
    Audio: class { async play() { plays++; } pause() {} },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}
  });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, requests, timers, copies, plays: () => plays };
}

test('interface preserva chat e áudio e confirma somente por clique', async () => {
  const { elements, requests, plays } = await rendererSetup();
  elements.input.value = 'Abra o bloco de notas';
  await elements.send.onclick();
  assert.equal(plays(), 1);
  assert.equal(requests.some(item => item.route === '/action/confirm'), false);
  const card = elements.messages.children.at(-1);
  assert.equal(card.children[1].textContent, 'Confirmar abertura');
  await card.children[1].onclick();
  const confirmation = requests.find(item => item.route === '/action/confirm');
  assert.equal(JSON.parse(confirmation.options.body).approved, true);
  assert.equal(card.children[1].disabled, true);
  assert.equal(plays(), 2);
});

test('controle direto permite cancelar e expira os botões', async () => {
  const { elements, requests, timers } = await rendererSetup();
  elements['computer-action'].value = 'app:notepad';
  await elements['computer-run'].onclick();
  let card = elements.messages.children.at(-1);
  await card.children[2].onclick();
  assert.equal(JSON.parse(requests.find(item => item.route === '/action/confirm').options.body).approved, false);
  await elements['computer-run'].onclick();
  card = elements.messages.children.at(-1);
  timers.at(-1)();
  assert.equal(card.children[1].disabled, true);
  assert.equal(card.children[2].disabled, true);
  assert.match(card.children[0].textContent, /expirada/);
});

test('consulta direta evita OpenAI e exibe nomes de processos como texto', async () => {
  const { elements, requests } = await rendererSetup();
  elements['computer-action'].value = 'processes';
  await elements['computer-run'].onclick();
  assert.equal(requests.some(item => item.route === '/chat'), false);
  assert.match(elements.messages.children.at(-1).textContent, /<script>example<\/script>/);
});

test('autorização exige seleção e confirmação humanas; API genérica não pode conceder acesso', async () => {
  const denied = setup();
  await assert.rejects(denied.invoke(denied.event, '/programming/authorize', { body: '{"path":"C:\\"}' }));
  assert.equal((await denied.handlers.get('jarvis:authorize-folder')(denied.event)).canceled, true);
  assert.equal(denied.requests.length, 0);
  const approved = setup({ authorized: true });
  await approved.handlers.get('jarvis:authorize-folder')(approved.event);
  assert.equal(approved.dialogs.length, 2);
  assert.equal(approved.requests[0].url, 'http://127.0.0.1:8765/programming/authorize');
  assert.equal(JSON.parse(approved.requests[0].options.body).path, 'C:\\Projects');
  const canceled = setup({ authorized: true, canceled: true });
  await canceled.handlers.get('jarvis:authorize-folder')(canceled.event);
  assert.equal(canceled.requests.length, 0);
});

test('cópia é limitada à janela confiável e nunca executa código', async () => {
  const { handlers, event, copies } = setup();
  assert.throws(() => handlers.get('jarvis:copy-code')({ ...event, sender: {} }, 'code'));
  assert.throws(() => handlers.get('jarvis:copy-code')(event, 'x'.repeat(100001)));
  handlers.get('jarvis:copy-code')(event, '<script>untrusted</script>');
  assert.deepEqual(copies, ['<script>untrusted</script>']);
});

test('modo de programação mostra projeto, copia código como texto e fala somente o resumo', async () => {
  const { elements, requests, copies } = await rendererSetup({ programming: true,
    reply: 'Sugestão:\n```ts\nconst example = "<script>";\n```\nAplique manualmente.', speechSummary: 'Explicação resumida.' });
  elements.input.value = 'Analise iPet';
  await elements.send.onclick();
  assert.equal(JSON.parse(requests.find(item => item.route === '/chat').options.body).mode, 'programming');
  assert.equal(JSON.parse(requests.find(item => item.route === '/speak').options.body).message, 'Explicação resumida.');
  assert.equal(elements['project-name'].textContent, 'Projeto: iPet');
  assert.equal(elements['computer-controls'].hidden, true);
  const card = elements.messages.children.at(-1);
  const codeBlock = card.children.find(child => child.className === 'code-block');
  await codeBlock.children[2].onclick();
  assert.deepEqual(copies, ['const example = "<script>";\n']);
  assert.equal(requests.some(item => item.route === '/action/confirm'), false);
});

test('interface autoriza por diálogo e permite revogar uma raiz', async () => {
  const { elements, requests } = await rendererSetup({ programming: true });
  await elements['authorize-project'].onclick();
  elements['authorized-roots'].value = 'C:\\Desktop';
  await elements['revoke-root'].onclick();
  assert.equal(JSON.parse(requests.find(item => item.route === '/programming/revoke').options.body).path, 'C:\\Desktop');
});

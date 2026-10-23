const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

function setup({
  authorized = false,
  canceled = false,
  ownsInstance = true,
  probe = false,
  quickToTray = true,
  cloud = false,
  authenticated = false,
} = {}) {
  const handlers = new Map();
  const requests = [];
  const copies = [];
  const dialogs = [];
  const exits = [];
  const appEvents = new Map();
  const windowEvents = new Map(),
    external = [];
  let windowOptions,
    maximized = false,
    fullscreen = false,
    hidden = false,
    quitCalls = 0,
    destroyCalls = 0;
  const frame = { url: pathToFileURL(path.join(__dirname, 'index.html')).href };
  const contents = {
    mainFrame: frame,
    setWindowOpenHandler() {},
    on(name, fn) {
      windowEvents.set(name, fn);
    },
  };
  class Window {
    constructor(options) {
      windowOptions = options;
      this.webContents = contents;
    }
    on(name, fn) {
      windowEvents.set(name, fn);
    }
    hide() {
      hidden = true;
    }
    maximize() {
      maximized = true;
    }
    setFullScreen(value) {
      fullscreen = value;
    }
    isFullScreen() {
      return fullscreen;
    }
    loadFile() {}
  }
  const electron = {
    dialog: {
      showOpenDialog: async (_, options) => {
        dialogs.push(options);
        return { canceled, filePaths: ['C:\\Projects'] };
      },
      showMessageBox: async (_, options) => {
        dialogs.push(options);
        return { response: authorized ? 1 : 0 };
      },
    },
    shell: { openExternal: async (url) => external.push(url) },
    clipboard: { writeText: (text) => copies.push(text) },
    app: {
      requestSingleInstanceLock: () => ownsInstance,
      exit: (code) => exits.push(code),
      disableHardwareAcceleration() {},
      whenReady: () => ({ then: (fn) => fn() }),
      on(name, fn) {
        appEvents.set(name, fn);
      },
      quit() {
        quitCalls++;
      },
    },
    BrowserWindow: Window,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8'), {
    __dirname,
    console,
    URL,
    process: {
      env: cloud
        ? { JARVIS_CLOUD: '1', ...(authenticated ? { JARVIS_AUTHENTICATED: '1' } : {}) }
        : {},
      argv: probe ? ['--jarvis-probe'] : [],
      on() {},
    },
    AbortSignal,
    require: (name) =>
      name === 'electron'
        ? electron
        : name === './clipboard-service'
          ? { install: () => ({ setActive() {}, setMasterSound() {}, destroy() {} }) }
          : name === './quick-controller'
            ? {
                createQuick: () => ({
                  getSettings: () => ({}),
                  setSettings: (v) => v,
                  setProject() {},
                  setMasterVoice() {},
                  claimAudio() {},
                  hideOnClose: () => quickToTray,
                  destroy() {
                    destroyCalls++;
                  },
                }),
              }
            : name === './window-state'
              ? { load: () => null, save() {} }
              : name === 'fs/promises'
                ? { readFile: async () => 'test-local-token' }
                : require(name),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ reply: 'Resposta' }) };
    },
  });
  return {
    invoke: handlers.get('jarvis:api'),
    handlers,
    copies,
    dialogs,
    exits,
    event: { sender: contents, senderFrame: frame },
    requests,
    windowEvents,
    appEvents,
    external,
    get destroyCalls() {
      return destroyCalls;
    },
    get windowOptions() {
      return windowOptions;
    },
    get hidden() {
      return hidden;
    },
    get quitCalls() {
      return quitCalls;
    },
    get maximized() {
      return maximized;
    },
    get fullscreen() {
      return fullscreen;
    },
  };
}

test('IPC permite somente a janela principal e rotas registradas', async () => {
  const { invoke, event, requests } = setup();
  await assert.rejects(invoke({ ...event, sender: {} }, '/history'));
  await assert.rejects(
    invoke({ ...event, senderFrame: { url: 'https://example.com' } }, '/history'),
  );
  await assert.rejects(invoke(event, '/action/execute'));
  await assert.rejects(invoke(event, 'https://example.com'));
  assert.equal(requests.length, 0);
});

test('anexos exigem janela principal autenticada e rotas privadas não entram na API genérica', async () => {
  const f = setup();
  for (const name of [
    'jarvis:attachments-choose',
    'jarvis:attachments-info',
    'jarvis:attachments-save',
    'jarvis:attachments-discard',
  ]) {
    await assert.rejects(
      f.handlers.get(name)({ ...f.event, senderFrame: { url: 'https://untrusted.test' } }),
      /não autorizada/,
    );
  }
  await assert.rejects(
    f.invoke(f.event, '/desktop/attachments/import', {
      body: JSON.stringify({ paths: ['C:/private.txt'] }),
    }),
    /não autorizada/,
  );
  assert.equal(f.requests.length, 0);
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
    constructor() {
      this.children = [];
      this.value = '';
      this.textContent = '';
      this.disabled = false;
    }
    appendChild(child) {
      this.children.push(child);
    }
    replaceChildren() {
      this.children = [];
    }
    addEventListener() {}
    focus() {}
  }
  const elements = Object.fromEntries(
    [
      'messages',
      'input',
      'send',
      'cancel-response',
      'status',
      'minimize',
      'close',
      'computer-run',
      'computer-action',
      'computer-controls',
      'programming-mode',
      'project-name',
      'authorized-roots',
      'revoke-root',
      'authorize-project',
    ].map((id) => [id, new Element()]),
  );
  elements['programming-mode'].checked = programming;
  const copies = [];
  let plays = 0;
  const action = {
    confirmation_id: 'pending-test',
    description: 'Abrir aplicativo: Bloco de Notas',
    expires_in_seconds: 120,
  };
  const api = async (route, options) => {
    requests.push({ route, options });
    const data =
      route === '/history'
        ? []
        : route === '/chat'
          ? {
              reply: reply || 'Aguardo confirmação.',
              speech_text: speechSummary,
              pending_actions: programming ? [] : [action],
              programming: {
                project: { name: 'iPet' },
                roots: [{ name: 'Desktop', path: 'C:\\Desktop' }],
              },
            }
          : route === '/action/open'
            ? { pending_action: action }
            : route === '/action/confirm'
              ? { result: 'Ação processada.' }
              : route === '/speak'
                ? { audio_base64: 'bXAz' }
                : route === '/computer/processes'
                  ? { total: 1, processes: [{ pid: 1, name: '<script>example</script>' }] }
                  : route === '/programming/status'
                    ? {
                        progress: 'Lendo arquivo index.ts...',
                        project: { name: 'iPet' },
                        roots: [{ name: 'Desktop', path: 'C:\\Desktop' }],
                      }
                    : { ok: true };
    return { ok: true, data };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8'), {
    document: { getElementById: (id) => elements[id], createElement: () => new Element() },
    window: {
      jarvisWindow: {
        api,
        minimize() {},
        close() {},
        copyCode: async (text) => copies.push(text),
        authorizeFolder: async () => ({ ok: true, data: {} }),
      },
    },
    Audio: class {
      async play() {
        plays++;
      }
      pause() {}
    },
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout() {},
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, requests, timers, copies, plays: () => plays };
}

test('interface preserva chat e áudio e confirma somente por clique', async () => {
  const { elements, requests, plays } = await rendererSetup();
  elements.input.value = 'Abra o bloco de notas';
  await elements.send.onclick();
  assert.equal(plays(), 1);
  assert.equal(
    requests.some((item) => item.route === '/action/confirm'),
    false,
  );
  const card = elements.messages.children.at(-1);
  assert.equal(card.children[1].textContent, 'Confirmar abertura');
  await card.children[1].onclick();
  const confirmation = requests.find((item) => item.route === '/action/confirm');
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
  assert.equal(
    JSON.parse(requests.find((item) => item.route === '/action/confirm').options.body).approved,
    false,
  );
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
  assert.equal(
    requests.some((item) => item.route === '/chat'),
    false,
  );
  assert.match(elements.messages.children.at(-1).textContent, /<script>example<\/script>/);
});

test('autorização exige seleção e confirmação humanas; API genérica não pode conceder acesso', async () => {
  const denied = setup();
  await assert.rejects(
    denied.invoke(denied.event, '/programming/authorize', { body: '{"path":"C:\\"}' }),
  );
  await assert.rejects(denied.invoke(denied.event, '/projects/register', { body: '{}' }));
  await assert.rejects(denied.invoke(denied.event, '/projects/remove', { body: '{}' }));
  await assert.rejects(denied.invoke(denied.event, '/chats/change', { body: '{}' }));
  assert.equal((await denied.handlers.get('jarvis:authorize-folder')(denied.event)).canceled, true);
  assert.equal(denied.requests.length, 0);
  const approved = setup({ authorized: true });
  await approved.handlers.get('jarvis:authorize-folder')(approved.event);
  assert.equal(approved.dialogs.length, 2);
  assert.equal(approved.requests[0].url, 'http://127.0.0.1:8765/projects/register');
  assert.equal(JSON.parse(approved.requests[0].options.body).path, 'C:\\Projects');
  const canceled = setup({ authorized: true, canceled: true });
  await canceled.handlers.get('jarvis:authorize-folder')(canceled.event);
  assert.equal(canceled.requests.length, 0);
});

test('remoção de projeto e exclusão de chat exigem diálogo humano', async () => {
  const denied = setup();
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    (await denied.handlers.get('jarvis:remove-project')(denied.event, id)).canceled,
    true,
  );
  assert.equal(
    (await denied.handlers.get('jarvis:manage-chat')(denied.event, id, 'delete')).canceled,
    true,
  );
  assert.equal(denied.requests.length, 0);
  const approved = setup({ authorized: true });
  await approved.handlers.get('jarvis:remove-project')(approved.event, id);
  const body = JSON.parse(approved.requests[0].options.body);
  assert.equal(body.confirmed, true);
  assert.equal(body.delete_memory, false);
  await approved.handlers.get('jarvis:manage-chat')(approved.event, id, 'delete');
  assert.equal(JSON.parse(approved.requests[1].options.body).delete, true);
});

test('cópia é limitada à janela confiável e nunca executa código', async () => {
  const { handlers, event, copies } = setup();
  assert.throws(() => handlers.get('jarvis:copy-code')({ ...event, sender: {} }, 'code'));
  assert.throws(() => handlers.get('jarvis:copy-code')(event, 'x'.repeat(100001)));
  handlers.get('jarvis:copy-code')(event, '<script>untrusted</script>');
  assert.deepEqual(copies, ['<script>untrusted</script>']);
});

test('modo de programação mostra projeto, copia código como texto e fala somente o resumo', async () => {
  const { elements, requests, copies } = await rendererSetup({
    programming: true,
    reply: 'Sugestão:\n```ts\nconst example = "<script>";\n```\nAplique manualmente.',
    speechSummary: 'Explicação resumida.',
  });
  elements.input.value = 'Analise iPet';
  await elements.send.onclick();
  assert.equal(
    JSON.parse(requests.find((item) => item.route === '/chat').options.body).mode,
    'programming',
  );
  assert.equal(
    JSON.parse(requests.find((item) => item.route === '/speak').options.body).message,
    'Explicação resumida.',
  );
  assert.equal(elements['project-name'].textContent, 'Projeto: iPet');
  assert.equal(elements['computer-controls'].hidden, true);
  const card = elements.messages.children.at(-1);
  const codeBlock = card.children.find((child) => child.className === 'code-block');
  await codeBlock.children[2].onclick();
  assert.deepEqual(copies, ['const example = "<script>";\n']);
  assert.equal(
    requests.some((item) => item.route === '/action/confirm'),
    false,
  );
});

test('interface autoriza por diálogo e permite revogar uma raiz', async () => {
  const { elements, requests } = await rendererSetup({ programming: true });
  await elements['authorize-project'].onclick();
  elements['authorized-roots'].value = 'C:\\Desktop';
  await elements['revoke-root'].onclick();
  assert.equal(
    JSON.parse(requests.find((item) => item.route === '/programming/revoke').options.body).path,
    'C:\\Desktop',
  );
});

test('janela nativa inicia maximizada, redimensionável e F11 alterna fullscreen', () => {
  const fixture = setup();
  assert.equal(fixture.windowOptions.frame, true);
  assert.equal(fixture.windowOptions.alwaysOnTop, false);
  assert.equal(fixture.windowOptions.resizable, true);
  assert.ok(fixture.windowOptions.minWidth >= 800);
  assert.equal(fixture.maximized, true);
  let prevented = false;
  fixture.windowEvents.get('before-input-event')(
    {
      preventDefault() {
        prevented = true;
      },
    },
    { type: 'keyDown', key: 'F11' },
  );
  assert.equal(prevented, true);
  assert.equal(fixture.fullscreen, true);
  fixture.windowEvents.get('before-input-event')(
    { preventDefault() {} },
    { type: 'keyDown', key: 'F11' },
  );
  assert.equal(fixture.fullscreen, false);
});
test('links externos exigem janela confiável, protocolo web e confirmação humana', async () => {
  const denied = setup(),
    open = denied.handlers.get('jarvis:open-link');
  await assert.rejects(open({ ...denied.event, sender: {} }, 'https://example.com'));
  for (const value of [
    'file:///C:/Windows',
    'javascript:alert(1)',
    'https://user:password@example.com',
  ])
    await assert.rejects(open(denied.event, value));
  await open(denied.event, 'https://example.com');
  assert.equal(denied.external.length, 0);
  const approved = setup({ authorized: true });
  await approved.handlers.get('jarvis:open-link')(approved.event, 'https://example.com');
  assert.deepEqual(approved.external, ['https://example.com/']);
});

test('Electron bloqueia segunda instância e probe não abre janela', () => {
  const second = setup({ ownsInstance: false });
  assert.deepEqual(second.exits, [73]);
  assert.equal(second.windowOptions, undefined);
  const probe = setup({ probe: true });
  assert.deepEqual(probe.exits, [0]);
  assert.equal(probe.windowOptions, undefined);
});

test('fechar principal encerra mesmo com preferência antiga de bandeja', () => {
  let prevented = false;
  const tray = setup();
  tray.windowEvents.get('close')({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(tray.hidden, false);
  assert.equal(tray.quitCalls, 1);
  const exit = setup({ quickToTray: false });
  exit.windowEvents.get('close')({ preventDefault() {} });
  assert.equal(exit.quitCalls, 1);
});

test('configuração privada exige janela confiável e não aceita rota genérica', async () => {
  const { handlers, event, invoke } = setup();
  await assert.rejects(
    handlers.get('jarvis:open-ai-config')({ ...event, sender: {} }),
    /autorizada/,
  );
  await assert.rejects(invoke(event, '/config'), /autorizada/);
});

test('Cloud bloqueia IPC e Quick Chat antes do login e destrói Quick Chat ao perder sessão', async () => {
  const locked = setup({ cloud: true });
  await assert.rejects(locked.invoke(locked.event, '/history'), /autorizada/);
  assert.equal(locked.requests.length, 0);
  const active = setup({ cloud: true, authenticated: true });
  await active.invoke(active.event, '/history');
  active.appEvents.get('jarvis:session-changed')(false);
  assert.equal(active.destroyCalls, 1);
});

test('limpeza local/nuvem exige confirmação nativa e janela autenticada; API genérica não apaga dados', async () => {
  const canceled = setup();
  assert.equal(
    (await canceled.handlers.get('jarvis:clear-storage')(canceled.event, 'cloud')).canceled,
    true,
  );
  assert.equal(canceled.requests.length, 0);
  const approved = setup({ authorized: true, cloud: true, authenticated: true });
  await approved.handlers.get('jarvis:clear-storage')(approved.event, 'local');
  assert.equal(JSON.parse(approved.requests[0].options.body).confirmed, true);
  assert.equal(JSON.parse(approved.requests[0].options.body).scope, 'local');
  await assert.rejects(
    approved.invoke(approved.event, '/desktop/storage/clear', { method: 'POST', body: '{}' }),
    /autorizada/,
  );
  await assert.rejects(
    approved.handlers.get('jarvis:clear-storage')({ ...approved.event, sender: {} }, 'local'),
    /autorizada/,
  );
  const locked = setup({ cloud: true });
  await assert.rejects(
    locked.handlers.get('jarvis:clear-storage')(locked.event, 'cloud'),
    /autorizada/,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

async function setup({ partial = false, delayed = false, oversized = false, clock = null } = {}) {
  const calls = [];
  const timers = [];
  let resolveChat;
  class Element {
    constructor() {
      this.children = [];
      this.textContent = '';
      this.value = '';
      this.disabled = false;
      this.checked = false;
      this.hidden = false;
    }
    appendChild(item) {
      this.children.push(item);
    }
    replaceChildren() {
      this.children = [];
    }
    addEventListener() {}
    focus() {}
  }
  const elements = {};
  const document = {
    addEventListener() {},
    getElementById: (id) => (elements[id] ??= new Element()),
    createElement: () => new Element(),
  };
  const project = {
    id: 'project-a',
    name: 'A',
    path: 'C:\\Fixtures\\A',
    ready: partial ? 0 : 1,
    state: partial ? 'partial' : 'ready',
    knowledge_version: 1,
    progress: 'Memória disponível',
  };
  const first = { id: 'first', project_id: project.id, title: 'Login' };
  const second = { id: 'second', project_id: project.id, title: 'Feed' };
  const chats = partial ? [] : [first, second];
  const api = async (route, options) => {
    calls.push({ route, options });
    let data;
    if (route === '/health') data = { ok: true };
    else if (route === '/workspace')
      data = { projects: [project], chats, general_chat_id: 'general' };
    else if (route === '/workspace/progress') data = { projects: [project] };
    else if (route === '/workspace/view')
      data = JSON.parse(options.body).project_id
        ? { project, chats, archived_chats: [] }
        : { project: null, chats: [{ id: 'general', title: 'Geral' }], archived_chats: [] };
    else if (route.startsWith('/chats/history?')) {
      const id = new URLSearchParams(route.split('?')[1]).get('chat_id');
      data = {
        chat: chats.find((item) => item.id === id) || { id: 'general', title: 'Geral' },
        messages: [{ id: 1, role: 'user', content: 'Contexto ' + id }],
      };
    } else if (route === '/chats/create') {
      data = { id: 'new', project_id: project.id, title: 'Novo' };
      chats.push(data);
    } else if (route === '/projects/accept-partial') {
      project.ready = 1;
      chats.push(first);
      data = project;
    } else if (route === '/programming/status') data = { project: null, roots: [] };
    else if (route === '/projects/selection/size')
      data = {
        selected_bytes: oversized ? 6291456 : 1024,
        max_bytes: 5242880,
        within_limit: !oversized,
      };
    else if (route === '/chat') {
      if (delayed)
        await new Promise((resolve) => {
          resolveChat = resolve;
        });
      data = { reply: 'Resposta independente.', speech_text: 'Resumo.', pending_actions: [] };
    } else if (route === '/speak') data = { audio_base64: 'bXAz' };
    else throw new Error('Rota inesperada: ' + route);
    return { ok: true, data };
  };
  const window = { jarvisWindow: { api, copyCode() {}, minimize() {}, close() {}, expand() {} } };
  const context = vm.createContext({
    window,
    document,
    console,
    encodeURIComponent,
    URLSearchParams,
    Date: clock
      ? class extends Date {
          static now() {
            return clock.now;
          }
        }
      : Date,
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout() {},
    Audio: class {
      async play() {}
      pause() {}
    },
  });
  for (const file of ['scope.js', 'workspace.js', 'renderer.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  await new Promise((resolve) => setImmediate(resolve));
  return { window, document, elements, calls, timers, chats, resolve: () => resolveChat() };
}

test('projetos e chats trocam histórico sem contaminar o contexto e novo chat reutiliza memória', async () => {
  const { elements, window, calls } = await setup();
  await window.jarvisWorkspace.view('project-a', 'first');
  assert.equal(window.jarvisWorkspace.chat.id, 'first');
  await window.jarvisWorkspace.view('project-a', 'second');
  assert.equal(window.jarvisWorkspace.chat.id, 'second');
  assert.equal(elements.messages.children[0].textContent, 'Contexto second');
  await window.jarvisWorkspace.newChat();
  assert.equal(window.jarvisWorkspace.chat.id, 'new');
  assert.equal(
    calls.some((item) => item.route === '/projects/refresh'),
    false,
  );
  assert.equal(
    calls.some((item) => item.route === '/projects/register'),
    false,
  );
});

test('análise parcial bloqueia a conversa até aceitação explícita', async () => {
  const { elements, window } = await setup({ partial: true });
  await window.jarvisWorkspace.view('project-a', 'first');
  assert.equal(window.jarvisWorkspace.chat, null);
  assert.equal(elements.send.disabled, true);
  assert.equal(elements['accept-partial'].hidden, false);
  await elements['accept-partial'].onclick();
  assert.equal(window.jarvisWorkspace.chat, null);
  await window.jarvisWorkspace.newChat();
  assert.equal(window.jarvisWorkspace.chat.id, 'new');
  assert.equal(elements.send.disabled, false);
});

test('Desktop preserva a pergunta e bloqueia envio quando o projeto ultrapassa 5 MB', async () => {
  const { elements, window, calls } = await setup({ oversized: true });
  await window.jarvisWorkspace.view('project-a', 'first');
  elements.input.value = 'Pergunta que deve ser preservada';
  await elements.send.onclick();
  assert.equal(elements.input.value, 'Pergunta que deve ser preservada');
  assert.ok(!calls.some((call) => call.route === '/chat'));
  assert.match(elements.messages.children.at(-1).textContent, /5 MB/);
});

test('resposta em andamento mantém seleção e envio bloqueados mesmo durante atualização da interface', async () => {
  const { elements, window, calls, resolve } = await setup({ delayed: true });
  await window.jarvisWorkspace.view('project-a', 'first');
  elements.input.value = 'Investigue o login';
  const running = elements.send.onclick();
  await new Promise((done) => setImmediate(done));
  window.jarvisWorkspace.controls();
  assert.equal(elements.send.disabled, true);
  assert.equal(elements['general-nav'].disabled, true);
  assert.equal(elements['add-project'].disabled, true);
  assert.equal(
    JSON.parse(calls.find((item) => item.route === '/chat').options.body).chat_id,
    'first',
  );
  resolve();
  await running;
  assert.equal(elements.send.disabled, false);
});

test('envio confirmado do clipboard respeita 5 MB, tamanho da mensagem e não cria chat', async () => {
  const { elements, window, calls } = await setup({ oversized: true });
  await window.jarvisWorkspace.view('project-a', 'first');
  elements.input.value = 'Rascunho normal preservado';
  await window.jarvisClipboardSend('Resuma o conteúdo copiado.');
  assert.equal(elements.input.value, 'Rascunho normal preservado');
  assert.ok(!calls.some((call) => call.route === '/chat' || call.route === '/chats/create'));
  const count = calls.length;
  assert.equal(await window.jarvisClipboardSend('x'.repeat(6001)), false);
  assert.equal(calls.length, count);
});

test('clipboard não cria conversa em projeto bloqueado e não inclui anexos pendentes sem revisão', async () => {
  const { window, calls } = await setup({ partial: true });
  await window.jarvisWorkspace.view('project-a', 'first');
  assert.equal(await window.jarvisClipboardSend('Explique o texto copiado.'), false);
  assert.ok(!calls.some((call) => call.route === '/chat' || call.route === '/chats/create'));
  await window.jarvisWorkspace.view(null, 'general');
  window.jarvisAttachments = { has: () => true };
  assert.equal(await window.jarvisClipboardSend('Explique o texto copiado.'), false);
  assert.ok(!calls.some((call) => call.route === '/chat'));
});

test('Nova conversa cria chat somente no envio confirmado da prévia do clipboard', async () => {
  const { window, elements, calls } = await setup();
  await window.jarvisWorkspace.view('project-a', null);
  assert.equal(window.jarvisWorkspace.chat, null);
  assert.ok(!calls.some((c) => c.route === '/chats/create'));
  elements.input.value = 'Rascunho normal';
  const result = await window.jarvisClipboardSend('Resuma este texto copiado.', 'draft:project-a');
  assert.equal(result, true);
  assert.equal(calls.filter((c) => c.route === '/chats/create').length, 1);
  assert.equal(JSON.parse(calls.find((c) => c.route === '/chat').options.body).chat_id, 'new');
  assert.equal(elements.input.value, 'Rascunho normal');
});

test('cache de sessão reutiliza A ao navegar A → B → A sem nova busca de histórico', async () => {
  const { window, calls, elements } = await setup();
  await window.jarvisWorkspace.view('project-a', 'first');
  await window.jarvisWorkspace.view('project-a', 'second');
  await window.jarvisWorkspace.view('project-a', 'first');
  assert.equal(elements.messages.children[0].textContent, 'Contexto first');
  assert.equal(calls.filter((item) => item.route === '/chats/history?chat_id=first').length, 1);
});

test('envio invalida histórico em cache antes de reabrir a conversa', async () => {
  const { window, calls } = await setup();
  await window.jarvisWorkspace.view('project-a', 'first');
  window.jarvisWorkspace.begin();
  window.jarvisWorkspace.end();
  await window.jarvisWorkspace.view('project-a', 'second');
  await window.jarvisWorkspace.view('project-a', 'first');
  assert.equal(calls.filter((item) => item.route === '/chats/history?chat_id=first').length, 2);
});

test('mudança de outra janela invalida e sincroniza somente a conversa ativa', async () => {
  const { window, calls, timers, chats } = await setup();
  await window.jarvisWorkspace.view('project-a', 'first');
  chats[0].last_message_at = '2026-10-27T12:00:00.001Z';
  await timers.find((fn) => fn.name === 'poll')(true);
  assert.equal(calls.filter((item) => item.route === '/chats/history?chat_id=first').length, 2);
  await window.jarvisWorkspace.view('project-a', 'second');
  await window.jarvisWorkspace.view('project-a', 'first');
  assert.equal(calls.filter((item) => item.route === '/chats/history?chat_id=first').length, 2);
});

test('abrir Quick na janela principal não consulta histórico duas vezes', async () => {
  const { window, calls } = await setup();
  await window.jarvisWorkspace.openById('first');
  assert.equal(window.jarvisWorkspace.chat.id, 'first');
  assert.equal(calls.filter((item) => item.route === '/chats/history?chat_id=first').length, 1);
});

test('falha de histórico não fica em cache e permite tentar novamente', async () => {
  const { window, calls } = await setup();
  const transport = window.jarvisWindow.api;
  let fail = true;
  window.jarvisWindow.api = async (route, options) => {
    if (route === '/chats/history?chat_id=first' && fail) {
      fail = false;
      throw new Error('Rede indisponível');
    }
    return transport(route, options);
  };
  await assert.rejects(window.jarvisWorkspace.view('project-a', 'first'), /Rede indisponível/);
  await window.jarvisWorkspace.view('project-a', 'first');
  assert.equal(window.jarvisWorkspace.chat.id, 'first');
  assert.equal(calls.filter((item) => item.route === '/chats/history?chat_id=first').length, 1);
});

test('exclusão observada em outra janela remove conteúdo e entrada do cache ativo', async () => {
  const { window, elements, timers, chats } = await setup();
  await window.jarvisWorkspace.view('project-a', 'first');
  chats.splice(0, 1);
  await timers.find((fn) => fn.name === 'poll')(true);
  assert.equal(window.jarvisWorkspace.chat, null);
  assert.equal(elements.messages.children.length, 0);
});

test('catálogo remoto não é consultado novamente nos ticks de dois segundos', async () => {
  const { calls, timers } = await setup();
  const before = calls.filter((item) => item.route === '/workspace').length;
  for (let tick = 0; tick < 30; tick++) await timers.find((fn) => fn.name === 'poll')();
  assert.equal(calls.filter((item) => item.route === '/workspace').length, before);
});

test('dez minutos com relógio controlado produzem dez sincronizações, não 300', async () => {
  const clock = { now: 0 };
  const { calls, timers } = await setup({ clock });
  const initial = calls.filter((item) => item.route === '/workspace').length;
  for (let tick = 1; tick <= 300; tick++) {
    clock.now = tick * 2000;
    await timers.find((fn) => fn.name === 'poll')();
  }
  assert.equal(calls.filter((item) => item.route === '/workspace').length - initial, 10);
});

test('janela oculta não consulta catálogo e visibilidade permite sincronização explícita', async () => {
  const clock = { now: 0 };
  const { calls, timers, document } = await setup({ clock });
  const initial = calls.filter((item) => item.route === '/workspace').length;
  document.visibilityState = 'hidden';
  clock.now = 600000;
  await timers.find((fn) => fn.name === 'poll')(true);
  assert.equal(calls.filter((item) => item.route === '/workspace').length, initial);
  document.visibilityState = 'visible';
  await timers.find((fn) => fn.name === 'poll')(true);
  assert.equal(calls.filter((item) => item.route === '/workspace').length, initial + 1);
});

test('indexação atualiza progresso local sem consultar o catálogo Cloud a cada tick', async () => {
  const { window, calls, timers } = await setup();
  await window.jarvisWorkspace.view('project-a', 'first');
  window.jarvisWorkspace.project.state = 'indexing';
  const initial = calls.filter((item) => item.route === '/workspace').length;
  await timers.find((fn) => fn.name === 'poll')();
  assert.equal(calls.filter((item) => item.route === '/workspace').length, initial);
  assert.equal(calls.filter((item) => item.route === '/workspace/progress').length, 1);
});

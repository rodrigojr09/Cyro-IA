const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
async function setup({ saved } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), {
    url: 'https://jarvis.local',
    runScripts: 'outside-only',
  });
  const w = dom.window,
    copies = [],
    links = [],
    calls = [],
    timers = [];
  if (saved) w.localStorage.setItem('jarvis.preferences', JSON.stringify(saved));
  w.setTimeout = (fn) => {
    timers.push(fn);
    return timers.length;
  };
  w.clearTimeout = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.jarvisWindow = {
    copyCode: async (text) => copies.push(text),
    openLink: async (href) => links.push(href),
    minimize() {},
    close() {},
    api: async (route, options) => {
      calls.push({ route, options });
      return {
        ok: true,
        data:
          route === '/workspace'
            ? { projects: [], chats: [] }
            : route === '/workspace/view'
              ? { project: null, chats: [], archived_chats: [] }
              : route === '/speak'
                ? { audio_base64: 'bXAz' }
                : {},
      };
    },
  };
  w.Audio = class {
    async play() {}
    pause() {}
  };
  for (const file of ['vendor.js', 'ui.js', 'storage-ui.js', 'workspace.js', 'renderer.js'])
    w.eval(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  await new Promise((resolve) => setImmediate(resolve));
  return { w, dom, copies, links, calls, timers };
}
test('Markdown sanitizado renderiza tabelas e código destacado sem HTML executável', async () => {
  const { w, dom, copies, links } = await setup();
  const el = w.document.createElement('article');
  w.jarvisUI.render(
    el,
    '## Título\n\n| Nome | Valor |\n|---|---|\n| A | B |\n\n```ts\nconst value = 42;\n```\n\n<script>alert(1)</script><img src=x onerror="alert(1)">\n\n[Seguro](https://example.com) [Inseguro](javascript:alert(1))',
  );
  assert.ok(el.querySelector('h2'));
  assert.ok(el.querySelector('table'));
  assert.ok(el.querySelector('.hljs-keyword'));
  assert.equal(el.querySelectorAll('script,img,[onclick],[onerror]').length, 0);
  assert.equal(el.querySelectorAll('a[href^="javascript:"]').length, 0);
  await el.querySelector('.code-block button').onclick();
  assert.equal(copies[0], 'const value = 42;\n');
  el.querySelector('a').click();
  assert.deepEqual(links, ['https://example.com']);
  dom.window.close();
});
test('preferências persistem e voz pode ser desativada sem solicitar áudio', async () => {
  const { w, dom, calls } = await setup();
  w.document.getElementById('voice-toggle').click();
  assert.equal(w.jarvisUI.voice, false);
  assert.equal(JSON.parse(w.localStorage.getItem('jarvis.preferences')).voice, false);
  await w.speak('Teste');
  assert.equal(
    calls.some((c) => c.route === '/speak'),
    false,
  );
  w.document.getElementById('sidebar-toggle').click();
  assert.ok(w.document.body.classList.contains('sidebar-collapsed'));
  dom.window.close();
});
test('compositor mantém Shift+Enter e não envia durante composição de texto', async () => {
  const { w, dom, calls } = await setup();
  const input = w.document.getElementById('input');
  input.value = 'linha';
  const event = new w.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true });
  input.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
  assert.equal(
    calls.some((c) => c.route === '/chat'),
    false,
  );
  dom.window.close();
});
test('rolagem respeita leitura e oferece retorno ao fim', async () => {
  const { w, dom } = await setup(),
    area = w.document.getElementById('conversation-scroll');
  Object.defineProperties(area, {
    scrollHeight: { value: 2000, configurable: true },
    clientHeight: { value: 500, configurable: true },
  });
  area.scrollTop = 200;
  w.addMessage('assistant', 'Resposta nova');
  assert.equal(area.scrollTop, 200);
  area.onscroll();
  assert.equal(w.document.getElementById('jump-bottom').hidden, false);
  w.document.getElementById('jump-bottom').click();
  assert.equal(area.scrollTop, 2000);
  dom.window.close();
});
test('janela valida limites e persiste estado, rejeitando posição fora dos monitores', () => {
  const state = require('./window-state'),
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-window-')),
    file = path.join(root, 'state.json');
  try {
    state.save(file, {
      getNormalBounds: () => ({ x: 30, y: 30, width: 1100, height: 700 }),
      isMaximized: () => true,
      isFullScreen: () => false,
    });
    assert.equal(
      state.load(file, [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]).maximized,
      true,
    );
    assert.equal(
      state.load(file, [{ workArea: { x: 3000, y: 0, width: 1000, height: 800 } }]),
      null,
    );
    fs.writeFileSync(file, 'invalid');
    assert.equal(state.load(file), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('áudio atrasado de outra conversa é descartado após parar reprodução', async () => {
  const { w, dom } = await setup();
  let resolve;
  let played = 0;
  w.jarvisWindow.api = () =>
    new Promise((done) => {
      resolve = done;
    });
  w.Audio = class {
    async play() {
      played++;
    }
    pause() {}
  };
  const speaking = w.speak('Resumo');
  w.jarvisUI.stopVoice();
  resolve({ ok: true, data: { audio_base64: 'bXAz' } });
  await speaking;
  assert.equal(played, 0);
  dom.window.close();
});

test('preferências são restauradas ao reinicializar a interface', async () => {
  const { w, dom } = await setup({ saved: { voice: false, collapsed: true, largeText: true } });
  assert.equal(w.jarvisUI.voice, false);
  assert.ok(w.document.body.classList.contains('sidebar-collapsed'));
  assert.ok(w.document.body.classList.contains('large-text'));
  dom.window.close();
});
test('busca da sidebar encontra chat em projeto recolhido e navegação não usa selects', async () => {
  const { w, dom } = await setup();
  const p = {
    id: 'project-a',
    name: 'Alpha',
    path: 'C:/Fixtures/Alpha',
    ready: 1,
    state: 'ready',
    scope_confirmed: 1,
    progress: 'Pronto',
  };
  const c = { id: 'chat-a', project_id: p.id, title: 'Login seguro', archived: 0 };
  w.jarvisWindow.api = async (route, options) => ({
    ok: true,
    data:
      route === '/workspace'
        ? { projects: [p], chats: [c] }
        : route === '/workspace/view'
          ? {
              project: JSON.parse(options.body).project_id ? p : null,
              chats: JSON.parse(options.body).project_id ? [c] : [],
              archived_chats: [],
            }
          : { chat: c, messages: [{ id: 1, role: 'user', content: 'Histórico de Alpha' }] },
  });
  await w.jarvisWorkspace.catalog('', null);
  const input = w.document.getElementById('nav-search');
  input.value = 'Login';
  input.dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelector('.chat-item').textContent, 'Login seguro');
  await w.document.querySelector('.chat-item').onclick();
  assert.equal(w.jarvisWorkspace.chat.id, c.id);
  assert.match(w.document.getElementById('messages').textContent, /Histórico de Alpha/);
  assert.equal(w.document.querySelectorAll('#sidebar select').length, 0);
  dom.window.close();
});

// Dialog headings and selected navigation expose the same state as the visual UI.
test('diálogos possuem nome acessível e navegação identifica a conversa ativa', async () => {
  const { w, dom } = await setup();
  for (const dialog of w.document.querySelectorAll('dialog')) {
    const heading = dialog.querySelector('h2');
    if (heading) assert.equal(dialog.getAttribute('aria-labelledby'), heading.id);
  }
  assert.equal(
    w.document.getElementById('manage-open').getAttribute('aria-label'),
    'Gerenciar conversa e memória',
  );
  dom.window.close();
});

test('os botões + criam conversa geral ou oferecem chat e Writer no projeto escolhido', async () => {
  const { w, dom } = await setup();
  const project = {
    id: 'project-plus',
    name: 'Meu projeto',
    path: 'C:/Project',
    ready: 1,
    scope_confirmed: 1,
    state: 'ready',
  };
  let chats = [],
    selectedWriter = null,
    createdIn = 'unset';
  const base = w.jarvisWindow.api;
  w.jarvisWriterUI = {
    async unmount() {},
    async createChat() {
      selectedWriter = w.jarvisWorkspace.project.id;
    },
  };
  w.jarvisWindow.api = async (route, options) => {
    let data;
    if (route === '/workspace') data = { projects: [project], chats };
    else if (route === '/workspace/view') {
      const id = JSON.parse(options.body).project_id;
      data = {
        project: id ? project : null,
        chats: chats.filter((c) => (c.project_id || null) === (id || null)),
        archived_chats: [],
      };
    } else if (route === '/chats/create') {
      createdIn = JSON.parse(options.body).project_id;
      data = { id: 'created', project_id: createdIn, title: 'Nova conversa' };
      chats.push(data);
    } else if (route.startsWith('/chats/history?')) data = { chat: chats.at(-1), messages: [] };
    else return base(route, options);
    return { ok: true, data };
  };
  await w.jarvisWorkspace.catalog(project.id);
  assert.equal(w.document.getElementById('new-chat'), null);
  w.document.querySelector('#project-list .navigation-add').click();
  assert.deepEqual(
    [...w.document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent),
    ['Chat do projeto', 'Cyro Writer'],
  );
  [...w.document.querySelectorAll('[role="menuitem"]')]
    .find((x) => x.textContent === 'Cyro Writer')
    .click();
  await new Promise(setImmediate);
  assert.equal(selectedWriter, project.id);
  await w.document.getElementById('new-general-chat').onclick();
  assert.equal(createdIn, null);
  dom.window.close();
});

test('configurações mostram só preferências e armazenamento sem opções técnicas antigas', async () => {
  const { w, dom } = await setup();
  w.document.getElementById('settings-open').click();
  const labels = [...w.document.getElementById('settings-tabs').children].map((b) => b.textContent);
  assert.deepEqual(labels, [
    'Aparência',
    'Voz',
    'Armazenamento',
    'Chats arquivados',
    'Quick Chat',
    'Área de transferência',
    'Integrações',
    'Conta',
    'Sobre',
  ]);
  [...w.document.getElementById('settings-tabs').children]
    .find((b) => b.textContent === 'Armazenamento')
    .click();
  assert.ok(w.document.getElementById('storage-usage'));
  assert.equal(w.document.getElementById('setting-ai-config'), null);
  assert.equal(w.document.getElementById('setting-migration'), null);
  dom.window.close();
});

test('Integrações navega dentro das configurações e exibe catálogo local sem conexões nem chamadas externas', async () => {
  const { w, dom, calls, links } = await setup();
  try {
    w.fetch = () => {
      throw Error('Integrações não deve usar rede');
    };
    const before = calls.length;
    w.document.getElementById('settings-open').click();
    const tab = [...w.document.querySelectorAll('#settings-tabs button')].find(
      (b) => b.textContent === 'Integrações',
    );
    assert(tab.querySelector('svg'));
    tab.click();
    assert.equal(tab.getAttribute('aria-current'), 'page');
    assert.equal(w.document.getElementById('settings-dialog').open, true);
    assert(
      w.document.getElementById('settings-dialog').classList.contains('settings-integrations'),
    );
    assert.equal(w.document.querySelectorAll('.integration-card').length, 6);
    assert.equal(
      w.document.querySelectorAll('.integration-card .integration-service-icon svg').length,
      5,
    );
    assert.deepEqual(
      [...w.document.querySelectorAll('.integration-status')].map((x) => x.textContent),
      ['Desconectada', ...Array(5).fill('Em breve')],
    );
    assert.equal(w.document.querySelectorAll('#settings-content input').length, 1);
    assert.equal(w.document.querySelector('#settings-content input').type, 'search');
    assert.equal(w.document.querySelector('#settings-content button[disabled]'), null);
    assert.equal(calls.length, before);
    assert.equal(links.length, 0);
    [...w.document.querySelectorAll('#settings-tabs button')]
      .find((b) => b.textContent === 'Voz')
      .click();
    assert(w.document.getElementById('setting-voice'));
    assert.equal(
      w.document.getElementById('settings-dialog').classList.contains('settings-integrations'),
      false,
    );
  } finally {
    dom.window.close();
  }
});

test('Integrações pesquisa por nome, categoria e descrição, combina filtros e mostra vazios reais', async () => {
  const { w, dom } = await setup();
  try {
    w.document.getElementById('settings-open').click();
    [...w.document.querySelectorAll('#settings-tabs button')]
      .find((b) => b.textContent === 'Integrações')
      .click();
    const search = w.document.getElementById('integrations-search');
    const query = (value) => {
      search.value = value;
      search.dispatchEvent(new w.Event('input'));
    };
    for (const [term, name] of [
      ['sPoTiFy', 'Spotify'],
      ['COMUNICACAO', 'Discord'],
      ['repositórios', 'GitHub'],
    ]) {
      query(term);
      assert.equal(w.document.querySelectorAll('.integration-card').length, 1);
      assert.equal(w.document.querySelector('.integration-card strong').textContent, name);
    }
    query('ausente');
    assert.equal(w.document.getElementById('integrations-empty').hidden, false);
    assert.match(
      w.document.getElementById('integrations-empty').textContent,
      /Nenhuma integração encontrada/,
    );
    query('');
    w.document.querySelector('[data-filter="connected"]').click();
    assert.equal(w.document.querySelectorAll('.integration-card').length, 0);
    assert.equal(
      w.document.getElementById('integrations-empty').textContent,
      'Você ainda não possui integrações conectadas.',
    );
    w.document.querySelector('[data-filter="available"]').click();
    assert.equal(w.document.querySelectorAll('.integration-card').length, 1);
    assert.equal(w.document.querySelector('.integration-card strong').textContent, 'Spotify');
    w.document.querySelector('[data-filter="coming_soon"]').click();
    assert.equal(w.document.querySelectorAll('.integration-card').length, 5);
    assert.equal(
      w.document.querySelector('[data-filter="coming_soon"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(w.document.getElementById('integrations-empty').hidden, true);
  } finally {
    dom.window.close();
  }
});

test('Integrações abre detalhes locais, mantém busca/filtro ao voltar e restaura foco no card', async () => {
  const { w, dom, calls } = await setup();
  try {
    w.document.getElementById('settings-open').click();
    [...w.document.querySelectorAll('#settings-tabs button')]
      .find((b) => b.textContent === 'Integrações')
      .click();
    const before = calls.length;
    const search = w.document.getElementById('integrations-search');
    search.value = 'Notion';
    search.dispatchEvent(new w.Event('input'));
    const card = w.document.querySelector('.integration-card');
    card.click();
    assert.equal(w.document.getElementById('integration-details').hidden, false);
    assert.equal(w.document.getElementById('integrations-catalog-view').hidden, true);
    assert.equal(w.document.activeElement.id, 'integration-details-name');
    assert.equal(w.document.getElementById('integration-details-name').textContent, 'Notion');
    assert(w.document.querySelectorAll('#integration-details li').length > 0);
    assert.match(
      w.document.getElementById('integration-details-content').textContent,
      /Esta integração ainda não está disponível/,
    );
    assert.equal(w.document.querySelector('#integration-details form'), null);
    w.document.getElementById('integration-details-back').click();
    assert.equal(w.document.activeElement, card);
    assert.equal(search.value, 'Notion');
    assert.equal(w.document.querySelectorAll('.integration-card').length, 1);
    assert.equal(calls.length, before);
  } finally {
    dom.window.close();
  }
});

test('menu contextual edita só o chat e arquivados saem da sidebar até restauração; diálogos fecham ao concluir', async () => {
  const { w, dom } = await setup();
  const project = {
    id: 'project-ui',
    name: 'Estudos',
    path: 'C:/Study',
    ready: 1,
    scope_confirmed: 1,
    state: 'ready',
    instructions: 'Orientação do projeto',
  };
  const general = {
    id: 'normal-ui',
    project_id: null,
    title: 'Conversa normal',
    archived: 0,
    instructions: 'Resposta breve',
  };
  const projectChat = {
    id: 'project-chat-ui',
    project_id: project.id,
    title: 'Revisão',
    archived: 0,
    instructions: 'Exemplos adicionais',
  };
  let chats = [general, projectChat],
    canceled = false;
  const base = w.jarvisWindow.api;
  w.jarvisWindow.api = async (route, options) => {
    let data;
    if (route === '/workspace') data = { projects: [project], chats };
    else if (route === '/workspace/view') {
      const id = JSON.parse(options.body).project_id;
      data = {
        project: id ? project : null,
        chats: chats.filter((c) => (c.project_id || null) === (id || null) && !c.archived),
        archived_chats: chats.filter((c) => (c.project_id || null) === (id || null) && c.archived),
      };
    } else if (route.startsWith('/chats/history?'))
      data = {
        chat: chats.find((c) => c.id === new URLSearchParams(route.split('?')[1]).get('chat_id')),
        messages: [],
      };
    else if (route === '/chats/settings') {
      const input = JSON.parse(options.body);
      data = chats.find((c) => c.id === input.chat_id);
      Object.assign(data, { title: input.title, instructions: input.instructions });
    } else if (route === '/projects/settings') {
      const input = JSON.parse(options.body);
      Object.assign(project, { name: input.name, instructions: input.instructions });
      data = project;
    } else return base(route, options);
    return { ok: true, data };
  };
  w.jarvisWindow.manageChat = async (id, action) => {
    if (canceled) return { canceled: true };
    const item = chats.find((c) => c.id === id);
    if (action === 'archive') item.archived = 1;
    if (action === 'restore') item.archived = 0;
    if (action === 'delete') chats = chats.filter((c) => c.id !== id);
    return { ok: true, data: {} };
  };
  await w.jarvisWorkspace.catalog('', general.id);
  const row = w.document.querySelector('#general-chats .chat-item');
  row.dispatchEvent(
    new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 70 }),
  );
  assert.equal(w.document.querySelectorAll('[role="menuitem"]').length, 5);
  [...w.document.querySelectorAll('[role="menuitem"]')]
    .find((b) => b.textContent === 'Nome e instruções')
    .click();
  await new Promise(setImmediate);
  assert.equal(w.document.getElementById('manage-dialog').open, true);
  assert.equal(w.document.getElementById('chat-instructions').value, 'Resposta breve');
  assert.equal(w.document.querySelector('#manage-dialog #refresh-memory'), null);
  w.document.getElementById('chat-instructions').value = 'Nova preferência';
  await w.document.getElementById('rename-chat').onclick();
  assert.equal(general.instructions, 'Nova preferência');
  assert.equal(w.document.getElementById('manage-dialog').open, false);
  await w.jarvisWorkspace.catalog(project.id, projectChat.id);
  w.jarvisWorkspace.openSettings();
  assert.equal(w.document.getElementById('chat-project-inheritance').hidden, false);
  w.document.getElementById('manage-dialog').close();
  w.jarvisWorkspace.openProjectSettings();
  assert.equal(w.document.getElementById('project-instructions').value, 'Orientação do projeto');
  w.document.getElementById('project-instructions').value = 'Novo contexto do projeto';
  await w.document.getElementById('save-project-settings').onclick();
  assert.equal(w.document.getElementById('project-settings-dialog').open, false);
  assert.equal(project.instructions, 'Novo contexto do projeto');
  assert.equal(projectChat.instructions, 'Exemplos adicionais');
  await w.jarvisWorkspace.catalog('', general.id);
  w.jarvisWorkspace.openSettings();
  canceled = true;
  await w.document.getElementById('archive-chat').onclick();
  assert.equal(w.document.getElementById('manage-dialog').open, true);
  canceled = false;
  await w.document.getElementById('archive-chat').onclick();
  assert.equal(w.document.getElementById('manage-dialog').open, false);
  assert.equal(w.document.getElementById('general-chats').children.length, 0);
  w.document.getElementById('settings-open').click();
  [...w.document.getElementById('settings-tabs').children]
    .find((b) => b.textContent === 'Chats arquivados')
    .click();
  await new Promise(setImmediate);
  assert.match(w.document.getElementById('archived-chat-list').textContent, /Conversa normal/);
  await w.document.querySelector('#archived-chat-list button').onclick();
  assert.equal(w.document.getElementById('settings-dialog').open, false);
  assert.equal(w.document.getElementById('general-chats').children.length, 1);
  await w.jarvisWorkspace.catalog('', general.id);
  w.jarvisWorkspace.openSettings();
  await w.document.getElementById('clear-chat').onclick();
  assert.equal(w.document.getElementById('manage-dialog').open, false);
  w.jarvisWorkspace.openSettings();
  await w.document.getElementById('delete-chat').onclick();
  assert.equal(w.document.getElementById('manage-dialog').open, false);
  dom.window.close();
});

test('armazenamento bloqueia envio com cota cheia, mantém limpeza acessível e recupera após confirmação', async () => {
  const { w, dom } = await setup();
  let full = true,
    clears = 0;
  const base = w.jarvisWindow.api;
  w.jarvisWindow.api = async (route, options) =>
    route === '/storage'
      ? {
          ok: true,
          data: {
            local: { usedBytes: 1048576 },
            cloud: { usedBytes: full ? 52428800 : 0, limitBytes: 52428800, blocked: full },
          },
        }
      : base(route, options);
  w.jarvisWindow.clearStorage = async (scope) => {
    assert.equal(scope, 'cloud');
    clears++;
    full = false;
    return { ok: true, data: { cleared: true } };
  };
  await w.jarvisStorageUsage.refresh();
  assert.equal(w.document.getElementById('send').disabled, true);
  assert.match(w.document.getElementById('storage-blocked').textContent, /Apague alguns chats/);
  w.document.getElementById('settings-open').click();
  [...w.document.getElementById('settings-tabs').children]
    .find((b) => b.textContent === 'Armazenamento')
    .click();
  await w.jarvisStorageUsage.refresh();
  const clear = [...w.document.querySelectorAll('#storage-usage button')].find(
    (b) => b.textContent === 'Apagar chats na nuvem',
  );
  assert.equal(clear.disabled, false);
  await clear.onclick();
  assert.equal(clears, 1);
  assert.equal(w.jarvisStorageUsage.blocked, false);
  assert.equal(w.document.getElementById('settings-dialog').open, false);
  assert.equal(w.document.getElementById('storage-blocked').hidden, true);
  dom.window.close();
});

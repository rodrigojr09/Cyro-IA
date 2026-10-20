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
  for (const file of ['vendor.js', 'ui.js', 'workspace.js', 'renderer.js'])
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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createClipboardManager, defaults } = require('./clipboard-manager');
async function setup(panel, manager) {
  const html = panel ? 'quick.html' : 'index.html';
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, html), 'utf8'), {
    url: 'file:///test/' + html + (panel ? '?panel=' + panel : ''),
    runScripts: 'outside-only',
  });
  const w = dom.window,
    owner = panel ? 'quick' : 'main';
  let listener,
    sends = [],
    opened = [],
    success = true,
    focused = false;
  w.document.hasFocus = () => focused;
  Object.defineProperty(w.document, 'visibilityState', { value: 'visible' });
  w.jarvisWorkspace = { chat: { id: 'existing-chat' } };
  w.jarvisClipboard = {
    state: async () => manager.state(),
    claim: async () => {
      const result = manager.claim(owner);
      listener(manager.state());
      return result;
    },
    dismiss: async (id) => {
      const result = manager.dismiss(owner, id);
      listener(manager.state());
      return result;
    },
    configure: async (value) => {
      const result = manager.configure(value);
      listener(result);
      return result;
    },
    discard: async () => manager.discardPending(),
    openLink: async (id) => {
      opened.push(manager.link(owner, id));
      return true;
    },
    onState: (fn) => (listener = fn),
    onSound() {},
  };
  w.quick = { onFocus() {}, resizeInput: async () => {} };
  w.jarvisClipboardSend = async (text) => {
    sends.push(text);
    return success;
  };
  w.eval(fs.readFileSync(path.join(__dirname, 'clipboard-ui.js'), 'utf8'));
  await Promise.resolve();
  return {
    dom,
    sends,
    opened,
    get: (id) => w.document.getElementById(id),
    update: () => listener(manager.state()),
    focus: async () => {
      focused = true;
      w.dispatchEvent(new w.Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    },
    fail: () => (success = false),
  };
}
test('dois indicadores sincronizados; primeiro chat recebe card; sem envio antes de confirmar', async () => {
  let text = 'Texto inicial';
  const manager = createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => text },
    config: { ...defaults, enabled: true },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const main = await setup(null, manager),
    quick = await setup('composer', manager),
    orb = await setup('orb', manager);
  text = 'Conteúdo novo para resumir';
  manager.tick();
  [main, quick, orb].forEach((f) => f.update());
  assert.equal(orb.get('clipboard-dot').hidden, false);
  await quick.focus();
  [main, quick, orb].forEach((f) => f.update());
  await main.focus();
  assert.equal(orb.get('clipboard-dot').hidden, true);
  assert.equal(main.get('clipboard-card').hidden, true);
  assert.equal(quick.get('clipboard-card').hidden, false);
  quick.get('clipboard-actions').querySelector('button').click();
  assert.equal(quick.sends.length, 0);
  assert.match(quick.get('clipboard-message').value, /Conteúdo novo/);
  assert.equal(quick.dom.window.jarvisStorage, undefined);
  quick.get('clipboard-message').value += '\nEditei a mensagem.';
  await quick.get('clipboard-confirm').onclick();
  assert.equal(quick.sends.length, 1);
  assert.match(quick.sends[0], /Editei/);
  assert.equal(quick.get('clipboard-card').hidden, true);
  [main, quick, orb].forEach((f) => f.dom.window.close());
  manager.destroy();
});

test('configurações exigem consentimento salvo e oferecem pausa, retomada e desativação', async () => {
  const manager = createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => 'Texto existente' },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const main = await setup(null, manager);
  await main.dom.window.jarvisClipboardSettings();
  assert.equal(main.get('clipboard-consent').checked, false);
  assert.equal(manager.state().settings.enabled, false);
  main.get('clipboard-consent').checked = true;
  assert.equal(manager.state().settings.enabled, false);
  main.get('clipboard-volume').value = '35';
  await main.get('clipboard-save').onclick();
  assert.equal(manager.state().settings.enabled, true);
  assert.equal(manager.state().settings.volume, 0.35);
  await main.get('clipboard-pause').onclick();
  assert.equal(manager.state().settings.paused, true);
  await main.get('clipboard-pause').onclick();
  assert.equal(manager.state().settings.paused, false);
  await main.get('clipboard-disable').onclick();
  assert.equal(manager.state().settings.enabled, false);
  assert.equal(main.sends.length, 0);
  main.dom.window.close();
  manager.destroy();
});

test('link abre somente após confirmar e não utiliza envio Cloud', async () => {
  let text = 'Inicial';
  const manager = createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => text },
    config: { ...defaults, enabled: true },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const quick = await setup('composer', manager);
  text = 'https://example.com/';
  manager.tick();
  quick.update();
  await quick.focus();
  quick.get('clipboard-actions').querySelector('button').click();
  assert.equal(quick.opened.length, 0);
  assert.equal(quick.sends.length, 0);
  assert.equal(quick.get('clipboard-message').readOnly, true);
  assert.match(quick.get('clipboard-preview-caption').textContent, /nenhum conteúdo será enviado/);
  await quick.get('clipboard-confirm').onclick();
  assert.deepEqual(quick.opened, ['https://example.com/']);
  assert.equal(quick.sends.length, 0);
  quick.dom.window.close();
  manager.destroy();
});
test('falha Cloud mantém prévia; nova cópia não substitui edição; mudança de chat bloqueia envio', async () => {
  let text = 'Inicial';
  const manager = createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => text },
    config: { ...defaults, enabled: true },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const main = await setup(null, manager);
  text = 'Texto para edição';
  manager.tick();
  main.update();
  await main.focus();
  main.get('clipboard-actions').querySelector('button').click();
  const preview = main.get('clipboard-message').value;
  text = 'Outra cópia independente';
  manager.tick();
  main.update();
  assert.equal(main.get('clipboard-message').value, preview);
  assert.equal(manager.state().pending, true);
  main.fail();
  await main.get('clipboard-confirm').onclick();
  assert.equal(main.get('clipboard-message').value, preview);
  assert.match(main.get('clipboard-feedback').textContent, /prévia foi mantida/);
  main.dom.window.jarvisWorkspace.chat = { id: 'different-chat' };
  await main.get('clipboard-confirm').onclick();
  assert.equal(main.sends.length, 1);
  assert.match(main.get('clipboard-feedback').textContent, /Volte ao chat/);
  manager.configure({ paused: true });
  main.update();
  assert.equal(main.get('clipboard-message').value, '');
  main.dom.window.close();
  manager.destroy();
});

test('título do texto expande e recolhe conteúdo literal, sem HTML executável ou envio', async () => {
  let text = 'Inicial';
  const manager = createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => text },
    config: { ...defaults, enabled: true },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const main = await setup(null, manager);
  text = '<img src=x onerror="alert(1)"> Conteúdo copiado';
  manager.tick();
  main.update();
  await main.focus();
  assert.equal(main.get('clipboard-content').hidden, true);
  main.get('clipboard-title').click();
  assert.equal(main.get('clipboard-content').hidden, false);
  assert.equal(main.get('clipboard-title').getAttribute('aria-expanded'), 'true');
  assert.equal(main.get('clipboard-original').textContent, text);
  assert.equal(main.get('clipboard-original').querySelector('img'), null);
  main.get('clipboard-title').click();
  assert.equal(main.get('clipboard-content').hidden, true);
  assert.equal(main.sends.length, 0);
  await main.get('clipboard-ignore').onclick();
  assert.equal(main.get('clipboard-original').textContent, '');
  main.dom.window.close();
  manager.destroy();
});
test('Imagem copiada expande prévia local, sem ações de IA falsas, e limpa o src ao descartar', async () => {
  let copiedImage = false;
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ZkAAAAASUVORK5CYII=',
    'base64',
  );
  const image = {
    isEmpty: () => false,
    getSize: () => ({ width: 1, height: 1 }),
    toPNG: () => bytes,
    resize: () => image,
  };
  const manager = createClipboardManager({
    clipboard: {
      availableFormats: () => (copiedImage ? ['image/png'] : []),
      readText: () => 'Inicial',
      readImage: () => image,
    },
    config: { ...defaults, enabled: true },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const quick = await setup('composer', manager);
  copiedImage = true;
  manager.tick();
  quick.update();
  await quick.focus();
  assert.equal(quick.get('clipboard-label').textContent, 'Imagem copiada');
  assert.equal(quick.get('clipboard-content').hidden, true);
  quick.get('clipboard-title').click();
  assert.equal(quick.get('clipboard-content').hidden, false);
  assert.match(quick.get('clipboard-image').src, /^data:image\/png;base64,/);
  assert.equal(quick.get('clipboard-actions').children.length, 0);
  assert.equal(quick.sends.length, 0);
  await quick.get('clipboard-ignore').onclick();
  assert.equal(quick.get('clipboard-image').hasAttribute('src'), false);
  quick.dom.window.close();
  manager.destroy();
});

test('janela principal em Nova conversa recebe cópia detectada depois do foco, sem criar chat', async () => {
  let text = 'Inicial';
  const manager = createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => text },
    config: { ...defaults, enabled: true },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const main = await setup(null, manager);
  main.dom.window.jarvisWorkspace.chat = null;
  await main.focus();
  text = 'Uma cópia detectada após voltar à janela';
  manager.tick();
  main.update();
  await new Promise(setImmediate);
  assert.equal(main.get('clipboard-card').hidden, false);
  assert.equal(manager.state().pending, false);
  assert.equal(main.dom.window.jarvisWorkspace.chat, null);
  assert.equal(main.sends.length, 0);
  main.get('clipboard-title').click();
  assert.equal(main.get('clipboard-original').textContent, text);
  main.dom.window.close();
  manager.destroy();
});

test('ignorar edição antiga não apaga a nova cópia reivindicada durante o descarte', async () => {
  let text = 'Inicial';
  const manager = createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => text },
    config: { ...defaults, enabled: true },
    schedule: () => 1,
    cancel() {},
  });
  manager.setActive(true);
  const main = await setup(null, manager);
  text = 'Primeira cópia';
  manager.tick();
  main.update();
  await main.focus();
  text = 'Segunda cópia independente';
  manager.tick();
  main.update();
  assert.equal(manager.state().pending, true);
  await main.get('clipboard-ignore').onclick();
  await new Promise(setImmediate);
  assert.equal(main.get('clipboard-card').hidden, false);
  assert.equal(main.get('clipboard-original').textContent, text);
  assert.ok(manager.state().owned.main);
  main.dom.window.close();
  manager.destroy();
});

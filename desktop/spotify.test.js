const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installSpotifyIPC } = require('./spotify-ipc');
const bundle = buildSync({
  entryPoints: [path.join(__dirname, 'spotify-ui.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'spotifyUI',
}).outputFiles[0].text;
const tick = () => new Promise(setImmediate);
test('Spotify configurações inicia/cancela OAuth e mostra estado real sem tokens', async () => {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window,
    requests = [];
  let connected = false,
    changed;
  w.jarvisSpotify = {
    request: async (input) => {
      requests.push(input);
      if (input.operation === 'status')
        return {
          configured: true,
          status: connected ? 'connected' : 'disconnected',
          displayName: 'Conta de teste',
        };
      if (input.operation === 'start') return { transactionId: 'opaque-id' };
      return { ok: true };
    },
  };
  w.eval(bundle);
  w.spotifyUI.mountSpotifySettings(w.document.querySelector('main'), (value) => (changed = value));
  await tick();
  assert.equal(changed.status, 'disconnected');
  const click = (label) =>
    [...w.document.querySelectorAll('button')].find((b) => b.textContent === label).click();
  click('Conectar');
  await tick();
  assert.match(w.document.querySelector('[role=status]').textContent, /autorize/);
  assert.equal(requests.at(-1).operation, 'start');
  click('Cancelar');
  await tick();
  assert(requests.some((r) => r.operation === 'cancel'));
  connected = true;
  click('Conectar');
  await tick();
  click('Cancelar');
  await tick();
  assert.equal(changed.status, 'connected');
  click('Testar conexão');
  await tick();
  assert.equal(requests.at(-1).command.action, 'test');
  assert.equal(w.document.querySelector('input[type=password]'), null);
  dom.window.close();
});
test('mini player fechado não consulta Spotify; falha não mostra sucesso', async () => {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window,
    calls = [];
  w.HTMLElement.prototype.getClientRects = () => [{}];
  w.jarvisSpotify = {
    request: async (input) => {
      calls.push(input);
      if (input.operation === 'status') return { status: 'connected' };
      return { error: 'Dispositivo indisponível' };
    },
  };
  w.eval(bundle);
  w.spotifyUI.mountSpotifyPlayer(w.document.querySelector('main'));
  await tick();
  assert.equal(calls.length, 0);
  w.document.querySelector('.spotify-player > button').click();
  await tick();
  assert.match(w.document.querySelector('[role=status]').textContent, /Dispositivo indisponível/);
  w.document.querySelector('.spotify-player > button').click();
  const count = calls.length;
  await tick();
  assert.equal(calls.length, count);
  dom.window.close();
});
test('IPC Spotify restringe janela, sessão, operações e navegador padrão', async () => {
  const handlers = new Map(),
    opened = [],
    requests = [];
  const frame = { url: pathToFileURL(path.join(__dirname, 'index.html')).href };
  const sender = { mainFrame: frame };
  const event = { sender, senderFrame: frame };
  const session = { credential: 'session-fixture', origin: 'https://jarvis.example.test' };
  const service = {
    current: () => session,
    request: async (route, method, input) => {
      requests.push({ route, method, input });
      return input.operation === 'start'
        ? {
            authorizationUrl:
              session.origin + '/api/integrations/spotify/authorize?ticket=' + 'a'.repeat(43),
            transactionId: 'tx-fixture',
          }
        : { ok: true };
    },
  };
  const previous = process.env.JARVIS_AUTHENTICATED;
  process.env.JARVIS_AUTHENTICATED = '1';
  try {
    installSpotifyIPC({
      electron: {
        ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
        BrowserWindow: { fromWebContents: () => ({}) },
        shell: { openExternal: async (url) => opened.push(url) },
        dialog: { showMessageBox: async () => ({ response: 1 }) },
      },
      service: () => service,
    });
    const invoke = handlers.get('spotify:request');
    assert.equal((await invoke(event, { operation: 'start' })).transactionId, 'tx-fixture');
    assert.equal(opened.length, 1);
    assert.equal(requests[0].route, '/api/integrations/spotify');
    await assert.rejects(
      invoke({ ...event, senderFrame: { url: 'https://evil.test' } }, { operation: 'status' }),
    );
    await assert.rejects(invoke(event, { operation: 'fetch', url: 'https://evil.test' }));
    frame.url = pathToFileURL(path.join(__dirname, 'quick.html')).href + '?panel=composer';
    await assert.rejects(invoke(event, { operation: 'start' }));
    assert.equal(
      (await invoke(event, { operation: 'control', command: { action: 'pause' } })).ok,
      true,
    );
    delete process.env.JARVIS_AUTHENTICATED;
    await assert.rejects(invoke(event, { operation: 'status' }));
  } finally {
    if (previous === undefined) delete process.env.JARVIS_AUTHENTICATED;
    else process.env.JARVIS_AUTHENTICATED = previous;
  }
});

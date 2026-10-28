const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const DESKTOP_ROOT = path.resolve(__dirname, '../..');
const { installSpotifyIPC } = require('../../scripts/integrations/spotify-ipc');
test('IPC Spotify restringe janela, sessão, operações e navegador padrão', async () => {
  const handlers = new Map(),
    opened = [],
    requests = [];
  const frame = { url: pathToFileURL(path.join(DESKTOP_ROOT, 'index.html')).href };
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
    frame.url = pathToFileURL(path.join(DESKTOP_ROOT, 'quick.html')).href + '?panel=composer';
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

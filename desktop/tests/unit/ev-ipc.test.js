const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { installEVIPC } = require('../../scripts/workspace/ev-ipc');

test('EV picker uploads unknown extensions as bytes and keeps the 8 MB bound', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-ev-any-'));
  const handlers = new Map(),
    requests = [],
    win = {};
  const frame = { url: pathToFileURL(path.resolve(__dirname, '../../index.html')).href };
  const sender = { mainFrame: frame },
    event = { sender, senderFrame: frame };
  const original = process.env.JARVIS_AUTHENTICATED;
  process.env.JARVIS_AUTHENTICATED = '1';
  try {
    const source = path.join(dir, 'arquivo.nova-extensao'),
      large = path.join(dir, 'grande.bin');
    await fs.writeFile(source, Buffer.from([0, 255, 1, 2]));
    await fs.writeFile(large, '');
    await fs.truncate(large, 8 * 1024 * 1024 + 1);
    installEVIPC({
      electron: {
        ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
        BrowserWindow: { fromWebContents: () => win },
        dialog: {
          showOpenDialog: async (_win, options) => {
            assert.deepEqual(options.filters[0].extensions, ['*']);
            return { filePaths: [source, large] };
          },
        },
      },
      service: () => ({
        current: () => ({ credential: 'synthetic', origin: 'https://fixture.test' }),
      }),
      dataDir: dir,
      fetcher: async (url, options) => {
        requests.push({ url, options });
        return Response.json({ file: { id: 'file', name: 'arquivo.nova-extensao' } });
      },
    });
    const result = await handlers.get('ev:upload')(event, '11111111-1111-4111-8111-111111111111');
    assert.equal(result.files.length, 1);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].error, /8 MB/);
    assert.equal(requests[0].options.headers['Content-Type'], 'application/octet-stream');
    assert.deepEqual(requests[0].options.body, Buffer.from([0, 255, 1, 2]));
  } finally {
    if (original === undefined) delete process.env.JARVIS_AUTHENTICATED;
    else process.env.JARVIS_AUTHENTICATED = original;
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('EV IPC authenticates main frame, restricts routes, rejects late account responses and isolates encrypted drafts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-ev-test-'));
  const handlers = new Map(),
    requests = [],
    win = {};
  const frame = { url: pathToFileURL(path.resolve(__dirname, '../../index.html')).href },
    sender = { mainFrame: null };
  sender.mainFrame = frame;
  const event = { sender, senderFrame: frame },
    projectId = '11111111-1111-4111-8111-111111111111';
  let account = { credential: 'A', origin: 'https://api.test' },
    pending;
  const service = {
    current: () => account,
    request: async (route, method, input) => {
      requests.push({ route, method, input });
      if (pending) return pending;
      return { ownerId: account.credential, space: { id: projectId }, spaces: [] };
    },
  };
  const old = process.env.JARVIS_AUTHENTICATED;
  process.env.JARVIS_AUTHENTICATED = '1';
  try {
    installEVIPC({
      electron: {
        ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
        BrowserWindow: { fromWebContents: () => win },
        dialog: {},
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (text) => Buffer.from('protected:' + Buffer.from(text).toString('base64')),
          decryptString: (raw) => Buffer.from(raw.toString().slice(10), 'base64').toString(),
        },
      },
      service: () => service,
      dataDir: dir,
    });
    const invoke = handlers.get('ev:request'),
      draft = handlers.get('ev:draft');
    await assert.rejects(
      invoke({ ...event, senderFrame: { url: 'https://evil.test' } }, { action: 'list' }),
    );
    await assert.rejects(draft(event, { projectId, operation: 'read' }));
    await invoke(event, { action: 'open', projectId });
    await draft(event, { projectId, operation: 'write', content: { text: 'PRIVATE_DRAFT_A' } });
    assert.equal(win.cyroEVDirty, true);
    assert.equal((await draft(event, { projectId, operation: 'read' })).text, 'PRIVATE_DRAFT_A');
    const filenames = await fs.readdir(path.join(dir, 'ev-drafts'));
    assert.ok(
      !(await fs.readFile(path.join(dir, 'ev-drafts', filenames[0]))).includes(
        Buffer.from('PRIVATE_DRAFT_A'),
      ),
    );
    account = { ...account, credential: 'B' };
    await invoke(event, { action: 'open', projectId });
    assert.equal(await draft(event, { projectId, operation: 'read' }), null);
    await invoke(event, { action: 'chat.send', projectId });
    assert.equal(requests.at(-1).route, '/api/ev/chat');
    await invoke(event, { action: 'memory.list', scope: 'MAIN' });
    assert.equal(requests.at(-1).route, '/api/memory');
    let resolve;
    pending = new Promise((r) => {
      resolve = r;
    });
    const late = invoke(event, { action: 'list' });
    account = { ...account, credential: 'C' };
    resolve({ spaces: ['PRIVATE_B'] });
    await assert.rejects(late, /sessão mudou/);
    delete process.env.JARVIS_AUTHENTICATED;
    await assert.rejects(invoke(event, { action: 'list' }));
  } finally {
    if (old === undefined) delete process.env.JARVIS_AUTHENTICATED;
    else process.env.JARVIS_AUTHENTICATED = old;
    const resolved = path.resolve(dir);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

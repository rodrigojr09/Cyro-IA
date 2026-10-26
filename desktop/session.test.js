const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const directory = path.join(__dirname, 'electron');
const loginPage = pathToFileURL(path.join(__dirname, 'login.html')).href;
const mainPage = pathToFileURL(path.join(__dirname, 'index.html')).href;
async function settle() {
  for (let i = 0; i < 10; i++) await new Promise(setImmediate);
}
async function setup({ saved = false, corrupt = false, failUnlock = false } = {}) {
  const handlers = new Map(),
    events = [],
    intervals = [],
    published = [],
    tokenFiles = [];
  let cloudOptions;
  const app = new EventEmitter();
  app.getPath = () => require('node:os').tmpdir();
  app.whenReady = () => Promise.resolve();
  app.on('jarvis:session-changed', (value) => events.push(value));
  app.on('jarvis:session-changed', (value) => {
    if (value && failUnlock) throw Error('synthetic unlock failure');
  });
  const frame = { url: loginPage };
  const contents = { mainFrame: frame, getURL: () => frame.url, send() {} };
  const window = {
    webContents: contents,
    loadFile: async (value) => {
      frame.url = pathToFileURL(value).href;
    },
  };
  let current = saved
    ? { origin: 'https://jarvis.example.test', credential: 'a'.repeat(43) }
    : null;
  let status = 'active';
  const service = {
    load: async () => {
      if (corrupt) throw Error('corrupt');
      return current;
    },
    current: () => current,
    state: () => ({ status }),
    refresh: async () => {
      if (status !== 'active') throw Error('unavailable');
    },
    login: async () => {
      current = { origin: 'https://jarvis.example.test', credential: 'b'.repeat(43) };
      status = 'active';
    },
    logout: async () => {
      current = null;
      status = 'inactive';
    },
  };
  const environment = {
    LOCALAPPDATA: path.join(require('node:os').tmpdir(), 'jarvis-local-test'),
    JARVIS_CLOUD_ORIGIN: 'https://jarvis.example.test',
    JARVIS_AUTHENTICATED: '1',
    SPOTIFY_CLIENT_SECRET: 'fixture-server-only',
    SPOTIFY_TOKEN_ENCRYPTION_KEY: 'fixture-server-key',
  };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'main.cjs'), 'utf8'), {
    __dirname: directory,
    process: { env: environment },
    AbortSignal,
    console,
    setInterval: (callback, delay) => {
      intervals.push({ callback, delay });
      return { unref() {} };
    },
    setTimeout,
    fetch: async (_url, options) => {
      published.push(JSON.parse(options.body));
      return { ok: true };
    },
    require: (name) => {
      if (name === 'electron')
        return {
          app,
          dialog: { showErrorBox() {} },
          safeStorage: {},
          ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
          BrowserWindow: { getAllWindows: () => [window] },
        };
      if (name === 'node:fs/promises')
        return {
          readFile: async (file) => {
            tokenFiles.push(file);
            return 'local-private-token';
          },
        };
      if (name === '../services/cloud')
        return {
          createCloud: (options) => {
            cloudOptions = options;
            return service;
          },
        };
      if (name === '../portable-paths')
        return { ...require('./portable-paths'), configureElectron() {} };
      if (name === '../spotify-ipc') return require('./spotify-ipc');
      if (name === '../main.js') return {};
      return require(name);
    },
  });
  await settle();
  return {
    handlers,
    environment,
    frame,
    events,
    intervals,
    published,
    tokenFiles,
    cloudOptions,
    event: { sender: contents, senderFrame: frame },
    setStatus: (value) => {
      status = value;
    },
  };
}
test('login restaura sessão apenas após validação; monitor bloqueia e recupera em cinco minutos', async () => {
  const state = await setup({ saved: true });
  assert.equal(state.intervals[0].delay, 300000);
  assert.equal(state.frame.url, mainPage);
  assert.equal(state.environment.JARVIS_AUTHENTICATED, '1');
  assert.equal(state.environment.SPOTIFY_CLIENT_SECRET, undefined);
  assert.equal(state.environment.SPOTIFY_TOKEN_ENCRYPTION_KEY, undefined);
  state.setStatus('offline');
  state.intervals[0].callback();
  await settle();
  assert.equal(state.frame.url, loginPage);
  assert.equal(state.environment.JARVIS_AUTHENTICATED, undefined);
  assert.equal(state.events.at(-1), false);
  state.setStatus('active');
  state.intervals[0].callback();
  await settle();
  assert.equal(state.frame.url, mainPage);
  assert.equal(state.events.at(-1), true);
  await state.handlers.get('jarvis:logout')(state.event);
  await settle();
  assert.equal(state.frame.url, loginPage);
  assert.equal(state.events.at(-1), false);
});

test('Cloud Desktop usa a mesma pasta LocalAppData do backend para publicar a sessão', async () => {
  const state = await setup({ saved: true });
  const expected = path.join(state.environment.LOCALAPPDATA, 'JARVIS');
  assert.equal(state.cloudOptions.dataDir, expected);
  assert.equal(state.environment.JARVIS_DATA_DIR, expected);
  assert.deepEqual(state.tokenFiles, [path.join(expected, '.local-token')]);
  assert.equal(state.frame.url, mainPage);
});

test('falha depois da autenticação bloqueia o Desktop e não acusa senha incorreta', async () => {
  const state = await setup({ failUnlock: true });
  await assert.rejects(
    state.handlers.get('jarvis:login')(state.event, {
      email: 'test@example.test',
      password: 'test-password-only',
    }),
    /Conta autenticada/,
  );
  assert.equal(state.environment.JARVIS_AUTHENTICATED, undefined);
  assert.equal(state.frame.url, loginPage);
  assert.equal(state.events.at(-1), false);
});
test('estado externo não dispensa login e arquivo corrompido não desativa o monitor', async () => {
  const state = await setup({ corrupt: true });
  assert.equal(state.environment.JARVIS_AUTHENTICATED, undefined);
  assert.equal(state.frame.url, loginPage);
  assert.equal(state.intervals[0].delay, 300000);
  await assert.rejects(state.handlers.get('jarvis:login')({ ...state.event, senderFrame: {} }, {}));
  await state.handlers.get('jarvis:login')(state.event, {
    email: 'test@example.test',
    password: 'password-for-test-only',
  });
  assert.equal(state.frame.url, mainPage);
  state.setStatus('offline');
  state.intervals[0].callback();
  await settle();
  assert.equal(state.frame.url, loginPage);
});

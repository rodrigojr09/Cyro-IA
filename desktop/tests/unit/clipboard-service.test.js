const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { install } = require('../../scripts/clipboard/service');
test('IPC autentica conta, frame e ambiente; persiste apenas preferências; indicadores não alteram foco', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-clipboard-test-'));
  const handlers = new Map(),
    events = [],
    overlays = [],
    opened = [];
  let authenticated = true,
    focused = true,
    minimized = true,
    permitLink = false,
    quickVisible = true;
  function window(kind) {
    const frame = {
      url:
        pathToFileURL(path.join(DESKTOP_ROOT, kind === 'main' ? 'index.html' : 'quick.html')).href +
        (kind === 'main' ? '' : '?panel=' + kind),
    };
    return {
      isDestroyed: () => false,
      isVisible: () => kind !== 'composer' || quickVisible,
      isFocused: () => focused,
      isMinimized: () => minimized,
      setOverlayIcon: (...value) => overlays.push(value),
      webContents: { mainFrame: frame, send: (name, value) => events.push({ name, value }) },
    };
  }
  const main = window('main'),
    composer = window('composer'),
    orb = window('orb');
  const event = (w) => ({ sender: w.webContents, senderFrame: w.webContents.mainFrame });
  let text = 'Baseline';
  const manager = install({
    electron: {
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      nativeImage: { createFromBitmap: () => 'red-dot' },
      clipboard: { availableFormats: () => [], readText: () => text },
      dialog: { showMessageBox: async () => ({ response: permitLink ? 1 : 0 }) },
      shell: { openExternal: async (url) => opened.push(url) },
    },
    dataDir: directory,
    mainWindow: () => main,
    quickWindows: () => ({ composer, orb }),
    authenticated: () => authenticated,
  });
  try {
    manager.setActive(true);
    assert.throws(
      () => handlers.get('clipboard:configure')(event(orb), { enabled: true }),
      /não autorizada/,
    );
    handlers.get('clipboard:configure')(event(main), { enabled: true });
    assert.throws(
      () => handlers.get('clipboard:ignore-own-copy')(event(orb), 'Texto interno'),
      /autorizada/,
    );
    assert.equal(handlers.get('clipboard:ignore-own-copy')(event(main), 'Texto interno'), true);
    text = 'Texto interno';
    manager.tick();
    assert.equal(manager.state().pending, false);
    text = 'Texto novo privado';
    manager.tick();
    if (process.platform === 'win32') assert.equal(overlays.at(-1)[0], 'red-dot');
    assert.equal(handlers.get('clipboard:claim')(event(main)).reason, 'NOT_ACTIVE_CHAT');
    minimized = false;
    focused = false;
    assert.equal(handlers.get('clipboard:claim')(event(main)).reason, 'QUICK_CHAT_OPEN');
    assert.equal(handlers.get('clipboard:claim')(event(composer)).ok, true);
    focused = true;
    if (process.platform === 'win32') assert.equal(overlays.at(-1)[0], null);
    assert.equal(handlers.get('clipboard:claim')(event(main)).ok, false);
    quickVisible = false;
    text = 'https://example.com/docs';
    manager.tick();
    assert.equal(handlers.get('clipboard:claim')(event(composer)).reason, 'NOT_ACTIVE_CHAT');
    focused = false;
    assert.equal(handlers.get('clipboard:claim')(event(main)).reason, 'NOT_ACTIVE_CHAT');
    assert.equal(manager.state().pending, true);
    focused = true;
    const link = handlers.get('clipboard:claim')(event(main));
    assert.equal(link.ok, true);
    assert.equal(
      await handlers.get('clipboard:open-link')(event(main), link.notification.id),
      false,
    );
    assert.equal(opened.length, 0);
    permitLink = true;
    await assert.rejects(
      handlers.get('clipboard:open-link')(event(composer), link.notification.id),
      /inválido/,
    );
    assert.equal(
      await handlers.get('clipboard:open-link')(event(main), link.notification.id),
      true,
    );
    assert.deepEqual(opened, ['https://example.com/docs']);
    assert.throws(
      () =>
        handlers.get('clipboard:state')({
          ...event(main),
          senderFrame: { url: 'https://evil.test' },
        }),
      /não autorizada/,
    );
    authenticated = false;
    assert.throws(() => handlers.get('clipboard:state')(event(main)), /não autorizada/);
    assert.equal(JSON.stringify(events).includes(text), false);
    const persisted = fs.readFileSync(
      path.join(directory, 'config/clipboard-settings.json'),
      'utf8',
    );
    assert.deepEqual(Object.keys(JSON.parse(persisted)).sort(), [
      'enabled',
      'paused',
      'sound',
      'volume',
    ]);
    assert.equal(persisted.includes(text), false);
  } finally {
    manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

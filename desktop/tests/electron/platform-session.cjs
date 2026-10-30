// Invoked only by the isolated platform test; no user profile or paid provider calls.
const { app, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { createCloud } = require('../../scripts/session/cloud');
const directory = process.env.CYRO_TEST_DATA;
if (!directory || !process.env.CYRO_TEST_ORIGIN?.startsWith('http://localhost:'))
  throw Error('Isolated local test configuration required.');
require('node:fs').mkdirSync(directory, { recursive: true });
app.setPath('userData', path.join(directory, 'profile'));
const timer = setTimeout(() => app.exit(1), 60000);
app.whenReady().then(async () => {
  try {
    await fs.mkdir(directory, { recursive: true });
    const client = createCloud({
      safeStorage,
      dataDir: directory,
      origin: process.env.CYRO_TEST_ORIGIN,
      packaged: false,
    });
    const session = await client.login(
      { email: process.env.CYRO_TEST_EMAIL, password: process.env.CYRO_TEST_PASSWORD },
      'Cyro platform test',
    );
    const state = await client.refresh();
    assert.equal(state.status, 'active');
    const encrypted = await fs.readFile(path.join(directory, 'cloud-session-v4.bin'));
    assert.ok(!encrypted.includes(Buffer.from(session.credential)));
    const restored = createCloud({
      safeStorage,
      dataDir: directory,
      origin: process.env.CYRO_TEST_ORIGIN,
      packaged: false,
    });
    await restored.load();
    await restored.refresh();
    const chat = await restored.request('/api/device/chats', 'POST', {
      action: 'fixed',
      slot: 'general',
    });
    assert.ok(chat.id);
    if (process.env.CYRO_TEST_UPDATE_ALIAS) {
      const alias = process.env.CYRO_TEST_UPDATE_ALIAS;
      const updater = require('../../scripts/updates/client').createUpdater({
        version: '7.0.0-alpha.0',
        origin: alias,
        directory: path.join(directory, 'updates'),
        request: (url, options) =>
          fetch(String(url).replace(alias, process.env.CYRO_TEST_ORIGIN), options),
        authorize: (id) =>
          restored.request('/api/updates/download', 'POST', { id, transport: 'backend' }),
        verifySignature: async () => 'NotSigned',
        install: async () => true,
        openLink: async () => {},
      });
      assert.equal((await updater.check()).phase, 'available');
      const downloaded = await updater.download();
      assert.equal(downloaded.phase, 'ready', JSON.stringify(downloaded));
      assert.equal((await updater.install()).phase, 'installing');
    }
    await restored.logout();
    assert.equal(restored.current(), null);
    console.log('Desktop session integration: passed');
    clearTimeout(timer);
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    clearTimeout(timer);
    app.exit(1);
  }
});

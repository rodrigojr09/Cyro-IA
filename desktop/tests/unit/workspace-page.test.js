const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  registerWorkspace, isWorkspaceEvent, openWorkspace, showLogin,
} = require('../../scripts/app/workspace-page.cjs');

function windowFixture(loadURL = async () => {}) {
  const opened = [];
  const win = {
    webContents: Object.assign(new EventEmitter(), { mainFrame: {} }),
    loadURL(url) {
      opened.push(url);
      return loadURL(url);
    },
    async loadFile(file) {
      opened.push(file);
    },
    isDestroyed: () => false,
  };
  return { win, opened };
}

test('the hosted renderer can call IPC only from the registered main frame and exact origin', async () => {
  const { win, opened } = windowFixture();
  registerWorkspace(win, { packaged: true, cloud: true, webDevelopment: true });
  await openWorkspace(win);
  assert.deepEqual(opened, ['https://web.cyro-ia.tech/']);
  const content = win.webContents;
  Object.assign(content.mainFrame, { url: opened[0], origin: 'https://web.cyro-ia.tech' });
  assert.equal(isWorkspaceEvent({ sender: content, senderFrame: content.mainFrame }), true);
  assert.equal(isWorkspaceEvent({ sender: content, senderFrame: { ...content.mainFrame } }), false);
  assert.equal(isWorkspaceEvent({ sender: { mainFrame: content.mainFrame }, senderFrame: content.mainFrame }), false);
  for (const url of ['https://web.cyro-ia.tech.evil.test/', 'https://web.cyro-ia.tech/other', 'http://127.0.0.1:3000/']) {
    content.mainFrame.url = url;
    assert.equal(isWorkspaceEvent({ sender: content, senderFrame: content.mainFrame }), false);
  }
  content.mainFrame.url = opened[0];
  content.mainFrame.origin = 'null';
  assert.equal(isWorkspaceEvent({ sender: content, senderFrame: content.mainFrame }), false);
});

test('a failed hosted load opens the bundled workspace, but a concurrent sign-out wins', async () => {
  const offline = windowFixture(async () => { throw Error('offline'); });
  registerWorkspace(offline.win, { packaged: true, cloud: true });
  await openWorkspace(offline.win);
  assert.match(offline.opened[1], /index\.html$/);

  let fail;
  const racing = windowFixture(() => new Promise((_, reject) => { fail = reject; }));
  registerWorkspace(racing.win, { packaged: true, cloud: true });
  const pending = openWorkspace(racing.win);
  await showLogin(racing.win);
  fail(Error('navigation cancelled'));
  await pending;
  assert.equal(racing.opened.length, 2);
  assert.match(racing.opened[1], /login\.html$/);
});

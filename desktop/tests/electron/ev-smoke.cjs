// Real Chromium, production preload and EV IPC, with a synthetic central API.
// Does not authenticate against production or read a personal profile.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { installEVIPC } = require('../../scripts/workspace/ev-ipc');
app.disableHardwareAcceleration();
let win;
const directory = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'cyro-ev-smoke-'));
app.setPath('userData', path.join(directory, 'profile'));
const timer = setTimeout(() => app.exit(1), 45000);
app.whenReady().then(async () => {
  try {
    process.env.JARVIS_AUTHENTICATED = '1';
    const ownerId = randomUUID(),
      projectId = randomUUID(),
      conversationId = randomUUID(),
      tableId = randomUUID(),
      columnId = randomUUID(),
      planId = randomUUID(),
      rowId = randomUUID();
    const space = { id: projectId, name: 'Transportadora de teste', state: 'READY' };
    let fail = true,
      calls = [],
      messages = [],
      artifacts = [];
    const session = { origin: 'https://api.test', credential: 'synthetic-ev-session' };
    const service = {
      current: () => session,
      request: async (_route, _method, c) => {
        calls.push(c);
        if (c.message === 'confirmar') assert.equal(c.confirmationProposalId, planId);
        if (c.action === 'assistant.open')
          return { ownerId, space, conversation: { id: conversationId }, messages, artifacts };
        if (c.action !== 'assistant.send') throw Error('Unexpected action');
        if (c.message.startsWith('crie'))
          return { ownerId, space, effect: 'OPEN_SPACE', reply: 'Espaço criado.' };
        if (fail)
          throw Object.assign(Error('Conexão de teste interrompida.'), { ev: true, status: 0 });
        messages = [
          ...messages,
          { id: messages.length + 1, role: 'user', content: c.message },
          {
            id: messages.length + 2,
            role: 'assistant',
            content:
              c.message === 'confirmar'
                ? 'Alteração confirmada e aplicada.'
                : 'Preparei uma proposta de alteração do frete.',
          },
        ];
        const item =
          c.message === 'confirmar'
            ? {
                type: 'TABLE',
                id: tableId,
                name: 'Conferência de fretes',
                rowCount: 1,
                columns: [{ id: columnId, name: 'Frete' }],
                rows: [{ id: rowId, data: { [columnId]: '22,50' } }],
              }
            : {
                type: 'PROPOSAL',
                id: planId,
                summary: 'Alterar o frete da primeira linha.',
                changes: [{ label: 'Frete', before: '10,00', after: '22,50' }],
              };
        if (c.message === 'confirmar')
          artifacts = artifacts.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              item.type === 'PROPOSAL' ? { ...item, state: 'APPLIED' } : item,
            ),
          }));
        artifacts = [...artifacts, { messageId: messages.at(-1).id, items: [item] }];
        return { ownerId, space, conversation: { id: conversationId }, messages, artifacts };
      },
    };
    installEVIPC({ electron: require('electron'), service: () => service, dataDir: directory });
    for (const [channel, value] of [
      ['cyro:updates-state', { phase: 'disabled' }],
      ['jarvis:voice-preference', null],
      ['jarvis:audio-claim', null],
      ['jarvis:workspace-ready', true],
      ['jarvis:initial-settings', { voice: false }],
      ['clipboard:state', { pending: false, owned: {}, settings: { enabled: false } }],
      ['clipboard:claim', { status: 'empty' }],
      ['writer:dirty', null],
    ])
      ipcMain.handle(channel, () => value);
    ipcMain.handle('jarvis:api', (_event, route) => {
      if (route === '/settings') return { ok: true, data: { voice: false } };
      if (route === '/storage') return { ok: true, data: { cloud: { blocked: false } } };
      if (route === '/workspace/view') return { ok: true, data: { project: null } };
      return { ok: true, data: { projects: [], chats: [], histories: {} } };
    });
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.resolve(__dirname, '../../scripts/app/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        offscreen: true,
      },
    });
    const js = (code) => win.webContents.executeJavaScript(code, true);
    const wait = async (code) => {
      for (let n = 0; n < 160; n++) {
        if (await js(code)) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw Error('Timed out: ' + code);
    };
    const input = async (selector, value) =>
      js(
        `(()=>{const node=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    await win.loadFile(path.resolve(__dirname, '../../index.html'));
    await wait(`!!document.getElementById('ev-message')`);
    assert.ok(
      await js(
        `!!document.querySelector('#ev-attach-files') && !!document.querySelector('#ev-microphone') && !!document.querySelector('#ev-send')`,
      ),
    );
    assert.equal(
      await js(`document.querySelectorAll('#add-project,.ev-tabs,.project-row').length`),
      0,
    );
    assert.equal(await js(`typeof require`), 'undefined');
    await input('#ev-message', 'crie um espaço chamado Transportadora de teste');
    await js(`document.querySelector('#ev-send').click()`);
    await wait(
      `document.querySelector('.ev-chat-heading h1').textContent==='Transportadora de teste' && !document.getElementById('ev-message').disabled`,
    );
    await input('#ev-message', 'edite o primeiro frete para 22,50');
    await js(`document.querySelector('#ev-send').click()`);
    await wait(`!!document.querySelector('.ev-chat-error')`);
    assert.equal(
      await js(`document.getElementById('ev-message').value`),
      'edite o primeiro frete para 22,50',
    );
    fail = false;
    await js(`document.querySelector('#ev-send').click()`);
    await wait(
      `!!document.querySelector('.ev-chat-proposal') && !document.getElementById('ev-message').disabled`,
    );
    const retries = calls.filter((c) => c.message === 'edite o primeiro frete para 22,50');
    assert.equal(retries[0].operationId, retries[1].operationId);
    await input('#ev-message', 'confirmar');
    await js(`document.querySelector('#ev-send').click()`);
    await wait(
      `!!document.querySelector('.ev-chat-table') && !document.getElementById('ev-message').disabled`,
    );
    assert.ok(
      await js(
        `!!document.querySelector('#ev-attach-files') && !!document.querySelector('#ev-microphone') && !!document.querySelector('#ev-send')`,
      ),
    );
    const shots = path.resolve(__dirname, '../../../build/v8');
    await fs.mkdir(shots, { recursive: true });
    await fs.writeFile(
      path.join(shots, 'ev-logistics-chat.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    assert.ok(calls.every((c) => c.action.startsWith('assistant.')));
    console.log(
      'EV Electron: chat-only creation, shared composer, retry, protected IPC, human confirmation and inline table passed.',
    );
    clearTimeout(timer);
    win.destroy();
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(resolved, { recursive: true, force: true }).catch((error) => {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
    });
    app.exit(0);
  } catch (e) {
    console.error(e.message);
    clearTimeout(timer);
    win?.destroy();
    app.exit(1);
  }
});

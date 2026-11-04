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
    const noteId = randomUUID();
    const note = { id: noteId, name: 'nota-teste.xml', status: 'PROCESSED' };
    const space = { id: projectId, name: 'Transportadora de teste', state: 'READY' };
    let memoryFacts = ["Prefiro respostas objetivas."], memoryControls = { automatic: true, useExisting: true }, memoryProposal;
    let fail = true,
      calls = [],
      messages = [],
      artifacts = [];
    const session = { origin: 'https://api.test', credential: 'synthetic-ev-session' };
    const service = {
      current: () => session,
      request: async (_route, _method, c) => {
        calls.push(c);
        if (c.action?.startsWith('memory.')) {
          assert.equal(_route, '/api/memory');
          if (c.action === 'memory.settings.get') return { settings: { ...memoryControls } };
          if (c.action === 'memory.settings') { assert.deepEqual(c.expected, memoryControls); memoryControls = { automatic: c.automatic, useExisting: c.useExisting }; return { persisted: true, settings: { ...memoryControls } }; }
          if (c.action === 'memory.list') return { store: { summary: memoryFacts.join(' '), syncState: 'READY' }, items: memoryFacts.map((content, i) => ({ id: String(i), content, origin: { kind: 'USER_CHAT' }, updatedAt: new Date().toISOString() })) };
          if (c.action === 'memory.message') { memoryProposal = randomUUID(); return { reply: 'Confirme para limpar a memória principal sem excluir conversas.', proposal: { id: memoryProposal, action: 'CLEAR' } }; }
          if (c.action === 'memory.confirm') { assert.equal(c.proposalId, memoryProposal); assert.equal(c.scope, 'MAIN'); if (c.decision === 'APPLY') memoryFacts = []; return { persisted: c.decision === 'APPLY', reply: 'Memória ativa limpa.' }; }
          throw Error('Unexpected memory action');
        }
        if (c.action === 'files.list') return { files: [note], next: null };
        if (c.action === 'file.get') { assert.equal(c.projectId, projectId); return { file: note, extracted: { type: 'FISCAL', documentType: 'NFE', number: '12345', total: '1450.00', freight: { value: '150.00' }, weight: '82', warnings: ['Documento fictício para teste.'] }, analyses: [{ id: 'saved', kind: 'CHAT', state: 'DONE', createdAt: '2026-11-04T12:00:00Z', reply: 'O frete declarado é 150.00.' }] }; }
        if (c.message === 'confirmar') assert.equal(c.confirmationProposalId, planId);
        if (c.action === 'assistant.open')
          return c.metadataOnly ? { ownerId, space, conversations: [], conversation: null, messages: [], artifacts: [] } : { ownerId, space, conversation: { id: conversationId }, messages, artifacts };
        if (c.action === 'conversation.create') return { conversation: { id: conversationId, title: 'Nova conversa' } };
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
    await wait(`!!document.getElementById('ev-nav') && !document.getElementById('ev-nav').disabled`);
    assert.equal(await js(`document.querySelector('.ev-chat').hidden`), true);
    assert.equal(calls.filter(c => c.action === 'assistant.open').length, 0);
    await js(`document.querySelector('#ev-nav').click()`);
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
    await wait(`!!document.querySelector('.ev-notes li button')`);
    await js(`document.querySelector('.ev-notes li button').click()`);
    await wait(`document.querySelector('.ev-note-detail')?.textContent.includes('150.00')`);
    assert.ok(await js(`document.querySelector('.ev-note-detail').textContent.includes('Documento fictício')`));
    assert.ok(await js(`document.querySelector('.ev-note-detail').textContent.includes('O frete declarado é')`));
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
    let capture;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { capture = await win.webContents.capturePage(); break; }
      catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 150)); }
    }
    await fs.writeFile(path.join(shots, 'ev-logistics-chat.png'), capture.toPNG());
    await js(`document.querySelector('#settings-open').click()`);
    await wait(`!!document.querySelector('#settings-tabs')`);
    await js(`[...document.querySelectorAll('#settings-tabs button')].find(b=>b.textContent==='Memória').click()`);
    await wait(`document.querySelector('.memory-summary')?.textContent.includes('respostas objetivas')`);
    assert.ok(await js(`document.querySelector('textarea[aria-label="Mensagem sobre memória"]').placeholder.includes('lembre ou esqueça')`));
    await js(`document.querySelector('.memory-toggle input').click()`);
    await wait(`!document.querySelector('.memory-toggle input').disabled && !document.querySelector('.memory-toggle input').checked`);
    assert.equal(memoryControls.automatic, false); assert.equal(memoryControls.useExisting, true);
    await js(`[...document.querySelectorAll('.memory-panel button')].find(b=>b.textContent==='Limpar memória principal').click()`);
    await wait(`!!document.querySelector('[aria-label="Confirmar alteração de memória"]')`);
    assert.equal(memoryFacts.length, 1);
    await js(`[...document.querySelectorAll('.memory-panel button')].find(b=>b.textContent==='Confirmar alteração').click()`);
    await wait(`document.querySelector('.memory-chat')?.textContent.includes('Memória ativa limpa')`);
    assert.equal(memoryFacts.length, 0);
    await fs.writeFile(path.join(shots, 'memory-v82-settings.png'), (await win.webContents.capturePage()).toPNG());
    console.log('V83_DESKTOP_PROCESS_METRICS ' + JSON.stringify({ scenario: 'EV conversation and memory settings', memoryUnit: 'KiB', processes: app.getAppMetrics().map(({ type, cpu, memory }) => ({ type, cpu, memory })) }));
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('V83_DESKTOP_IDLE_METRICS ' + JSON.stringify({ scenario: 'idle 3 seconds after interaction', memoryUnit: 'KiB', processes: app.getAppMetrics().map(({ type, cpu, memory }) => ({ type, cpu, memory })) }));
    const renderer = app.getAppMetrics().find(m => m.pid === win.webContents.getOSProcessId());
    console.log('V82_DESKTOP_MEMORY_METRICS ' + JSON.stringify(renderer?.memory || {}));
    assert.ok(calls.every(c => c.action.startsWith('assistant.') || c.action.startsWith('memory.') || ['files.list','file.get','conversation.create'].includes(c.action)));
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
    console.error(e.stack || e.message);
    clearTimeout(timer);
    win?.destroy();
    app.exit(1);
  }
});

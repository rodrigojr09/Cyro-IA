// Real Chromium, production preload and EV IPC, with a synthetic central API.
// Does not authenticate against production or read a personal profile.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { installEVIPC } = require('../../scripts/workspace/ev-ipc');
const workspacePage = require('../../scripts/app/workspace-page.cjs');
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
    const note = {
      id: noteId, name: 'nota-teste.xml', status: 'PROCESSED',
      fiscal: { number: '45892', total: '1240.00', accessKey: '1'.repeat(44) },
    };
    const space = {
      id: projectId,
      chatId: conversationId,
      extensionId: 'cyro.logistics',
      name: 'Transportadora de teste',
      state: 'READY',
      revision: 1,
      description: 'Espaço de teste',
      extensionVersion: '1.0.0',
    };
    let memoryFacts = ['Prefiro respostas objetivas.'],
      memoryControls = { automatic: true, useExisting: true },
      memoryProposal;
    let fail = true,
      createdEV = false,
      calls = [],
      messages = [],
      artifacts = [];
    let workbench = {
      revision: 0,
      files: [
        {
          name: 'main.py',
          content: 'from datetime import date\n\nprazos = [3, 2, 5]\nprint(sum(prazos))\n',
          revision: 1,
        },
        {
          name: 'index.html',
          content:
            '<style>body{background:#f2f5fa!important;padding:30px!important}h1{font-size:27px;letter-spacing:-1px;margin:0}.eyebrow{font-size:10px;letter-spacing:2px;color:#378eae}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.card{background:white;border:1px solid #e3e9f2;border-radius:14px;padding:22px}.card b{display:block;color:#173b55;font-size:32px}.card small{color:#68778c}.status{display:inline-block;color:#16755e;background:#e2f4ed;border-radius:6px;padding:4px 8px;font-size:11px;margin-top:15px}p{color:#6e7a8e}</style><span class="eyebrow">CYRO · RESULTADO</span><h1>Uma visão mais clara.</h1><p>Seu código, transformado em resultado.</p><div class="grid"><div class="card"><b>24</b><small>entregas organizadas</small></div><div class="card"><b>98%</b><small>dentro do prazo</small></div></div><span class="status">✓ Dados do espaço de teste</span>',
          revision: 1,
        },
      ],
      tables: [
        {
          name: 'prazos',
          columns: ['Destino', 'Dias'],
          rows: [
            ['São Paulo', 3],
            ['Curitiba', 2],
          ],
        },
      ],
      executions: [],
    };
    const session = { origin: 'https://api.test', credential: 'synthetic-ev-session' };
    const service = {
      current: () => session,
      request: async (_route, _method, c) => {
        c ||= { action: 'catalog' };
        calls.push(c);
        if (c.action === 'tables.list') return { tables: [] };
        if (c.action === 'table.read' && c.focusRowId === rowId)
          return {
            table: { name: 'Conferência de fretes', rowCount: 51, revision: 1, columns: [{ id: columnId, name: 'Frete' }] },
            rows: [{ id: rowId, data: { [columnId]: '22,50' } }],
            offset: 50,
          };
        if (c.action === 'workbench.runFile') {
          const file = workbench.files.find((f) => f.name === c.name);
          workbench = {
            ...workbench,
            revision: workbench.revision + 1,
            preview: { format: 'html', content: file.content, title: file.name },
            panel: {
              kind: 'preview',
              target: 'document',
              source: 'workbench',
              token: randomUUID(),
            },
          };
          return structuredClone(workbench);
        }
        if (c.action === 'workbench.list') return structuredClone(workbench);
        if (c.action === 'workbench.write') {
          workbench = {
            ...workbench,
            revision: workbench.revision + 1,
            files: [{ name: c.name, content: c.content }],
          };
          return structuredClone(workbench);
        }
        if (c.action === 'catalog')
          return {
            enabled: true,
            sdkVersion: '0.1.7',
            extensions: [
              {
                id: 'cyro.logistics',
                name: 'Cyro Logístico',
                version: '1.0.0',
                sdkVersion: '0.1.6',
                sdkStatus: 'outdated',
                description: 'Transporte',
                permissions: ['storage', 'messages', 'files'],
                installed: true,
              },
            ],
          };
        if (c.action === 'open') return { ownerId, space };
        if (c.action === 'conversation.read')
          return { conversation: { id: conversationId }, messages };
        if(c.action==='conversation.clear'){assert.equal(c.confirmation,'LIMPAR');messages=[];artifacts=[];return {cleared:true};}
        if (c.action === 'list') return { ownerId, spaces: createdEV ? [space] : [] };
        if (c.action === 'create') {
          createdEV = true;
          assert.equal(c.extensionId, 'cyro.logistics');
          assert.equal(c.name, space.name);
          return { ownerId, space };
        }
        if (c.action?.startsWith('memory.')) {
          assert.equal(_route, '/api/memory');
          if (c.action === 'memory.settings.get') return { settings: { ...memoryControls } };
          if (c.action === 'memory.settings') {
            assert.deepEqual(c.expected, memoryControls);
            memoryControls = { automatic: c.automatic, useExisting: c.useExisting };
            return { persisted: true, settings: { ...memoryControls } };
          }
          if (c.action === 'memory.list')
            return {
              store: { summary: memoryFacts.join(' '), syncState: 'READY' },
              items: memoryFacts.map((content, i) => ({
                id: String(i),
                content,
                origin: { kind: 'USER_CHAT' },
                updatedAt: new Date().toISOString(),
              })),
            };
          if (c.action === 'memory.message') {
            memoryProposal = randomUUID();
            return {
              reply: 'Confirme para limpar a memória principal sem excluir conversas.',
              proposal: { id: memoryProposal, action: 'CLEAR' },
            };
          }
          if (c.action === 'memory.confirm') {
            assert.equal(c.proposalId, memoryProposal);
            assert.equal(c.scope, 'MAIN');
            if (c.decision === 'APPLY') memoryFacts = [];
            return { persisted: c.decision === 'APPLY', reply: 'Memória ativa limpa.' };
          }
          throw Error('Unexpected memory action');
        }
        if (c.action === 'files.list') return { files: [note], next: null };
        if (c.action === 'file.get') {
          assert.equal(c.projectId, projectId);
          return {
            file: note,
            extracted: {
              type: 'FISCAL',
              documentType: 'NFE',
              number: '12345',
              total: '1450.00',
              freight: { value: '150.00' },
              weight: '82',
              warnings: ['Documento fictício para teste.'],
            },
            analyses: [
              {
                id: 'saved',
                kind: 'CHAT',
                state: 'DONE',
                createdAt: '2026-11-04T12:00:00Z',
                reply: 'O frete declarado é 150.00.',
              },
            ],
          };
        }
        if (c.message === 'confirmar') assert.equal(c.confirmationProposalId, planId);
        if (c.action === 'assistant.open')
          return c.metadataOnly
            ? { ownerId, space, conversations: [], conversation: null, messages: [], artifacts: [] }
            : { ownerId, space, conversation: { id: conversationId }, messages, artifacts };
        if (c.action === 'conversation.create')
          return { conversation: { id: conversationId, title: 'Nova conversa' } };
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
        const items = c.message === 'confirmar'
          ? [item, { type: 'REFERENCES', references: [{ kind: 'table', id: tableId, rowId, name: 'Conferência de fretes' }] }]
          : [item];
        artifacts = [...artifacts, { messageId: messages.at(-1).id, items }];
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
    const js = (code) =>
      win.webContents.executeJavaScript(code, true).catch((error) => {
        throw new Error(`${error.message}\nRenderer script: ${code}`);
      });
    const wait = async (code) => {
      for (let n = 0; n < 160; n++) {
        if (await js(code)) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw Error('Timed out: ' + code);
    };
    const rightClick = (selector) => js(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      const { left, top } = node.getBoundingClientRect();
      node.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, button: 2, clientX: left + 8, clientY: top + 8
      }));
    })()`);
    const menuAction = (label) => js(`[...document.querySelectorAll('.context-menu [role="menuitem"]')]
      .find(item => item.textContent.trim() === ${JSON.stringify(label)}).click()`);
    const input = async (selector, value) =>
      js(
        `(()=>{const node=document.querySelector(${JSON.stringify(selector)});const type=node.tagName==='TEXTAREA'?HTMLTextAreaElement:node.tagName==='SELECT'?HTMLSelectElement:HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      );
    if (process.env.CYRO_WEB_DEVELOPMENT === '1') {
      workspacePage.registerWorkspace(win, { packaged: false, cloud: true, webDevelopment: true });
      await workspacePage.openWorkspace(win);
      assert.equal(win.webContents.getURL(), 'http://127.0.0.1:3000/');
    } else {
      await win.loadFile(path.resolve(__dirname, '../../index.html'));
    }
    await wait(
      `!!document.getElementById('ev-nav') && !document.getElementById('ev-nav').disabled`,
    );
    assert.equal(await js(`!!document.querySelector('.ev-chat')`), false);
    assert.equal(calls.filter((c) => c.action === 'assistant.open').length, 0);
    assert.equal(await js(`document.querySelector('#ev-nav').nextElementSibling.id`), 'new-general-chat');
    assert.equal(await js(`document.querySelector('#quick-nav').textContent.trim()`), 'Chat rápido');
    assert.equal(await js(`document.querySelector('#attach-files').getAttribute('aria-describedby')`), 'attachment-caption');
    await wait(`document.querySelector('#attachment-caption')?.textContent.includes('enviado à IA')`);
    assert.equal(await js(`getComputedStyle(document.querySelector('#attachment-caption')).display`), 'none');
    await js(`document.querySelector('.attachment-privacy-label').focus()`);
    await wait(`getComputedStyle(document.querySelector('#attachment-caption')).display === 'block'`);
    await js(`document.querySelector('#sidebar-toggle').click()`);
    await wait(`document.body.classList.contains('sidebar-collapsed')`);
    await js(`document.querySelector('#sidebar-toggle').click()`);
    await wait(`!document.body.classList.contains('sidebar-collapsed')`);
    const homeShot = path.resolve(__dirname, '../../../build/v10/chat-sidebar.png');
    await fs.mkdir(path.dirname(homeShot), { recursive: true });
    await fs.writeFile(homeShot, (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector('#suggest-project').click()`);
    await wait(`document.getElementById('ev-create-menu').open`);
    assert.equal(await js(`!!document.getElementById('ev-message')`), false);
    await js(`document.querySelector('#ev-create-menu button[aria-label="Fechar"]').click()`);
    await wait(
      `!document.getElementById('ev-create-menu').open && !document.querySelector('main.main-panel').hidden`,
    );
    assert.equal(await js(`!!document.querySelector('.ev-chat')`), false);
    await js(`document.querySelector('#ev-nav').click()`);
    await wait(`document.getElementById('ev-create-menu').open`);
    assert.equal(
      await js(
        `getComputedStyle([...document.querySelectorAll('.navigation-heading')].find(n=>n.textContent==='Conversas recentes')).fontWeight`,
      ),
      '700',
    );
    assert.equal(
      await js(`document.querySelectorAll('#add-project,.ev-tabs,.project-row').length`),
      0,
    );
    assert.equal(await js(`typeof require`), 'undefined');
    await wait(`document.getElementById('ev-create-menu').open`);
    await js(
      `[...document.querySelectorAll('#ev-create-menu button')].find(b=>b.textContent==='Explorar catálogo').click()`,
    );
    await wait(
      `document.getElementById('ev-extension-menu').open && !!document.querySelector('#ev-extension-menu .integration-card')`,
    );
    await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const catalogShot = path.resolve(__dirname, '../../../build/v9/ev-extension-catalog.png');
    await fs.mkdir(path.dirname(catalogShot), { recursive: true });
    await fs.writeFile(catalogShot, (await win.webContents.capturePage()).toPNG());
    await input('#ev-catalog-search', 'sem resultados');
    await wait(`document.querySelectorAll('#ev-extension-menu .integration-card').length===0`);
    await input('#ev-catalog-search', '');
    await wait(`!!document.querySelector('#ev-extension-menu .integration-card')`);
    await js(`document.querySelector('#ev-extension-menu .integration-card').click()`);
    await wait(`!!document.querySelector('#ev-extension-menu .integration-details')`);
    await wait(`document.querySelector('#ev-extension-menu .ev-sdk-notice')?.textContent.includes('SDK desatualizado')`);
    await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    await fs.writeFile(
      path.resolve(__dirname, '../../../build/v9/ev-extension-details.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(
      `[...document.querySelectorAll('#ev-extension-menu button')].find(b=>b.textContent==='Usar este tipo').click()`,
    );
    await wait(
      `document.getElementById('ev-create-menu').open && !document.getElementById('ev-extension-menu').open`,
    );
    await input('select[aria-label="Tipo do novo espaço"]', 'cyro.logistics');
    await input('input[aria-label="Nome do espaço"]', 'Transportadora de teste');
    await wait(
      `document.querySelector('input[aria-label="Nome do espaço"]').value==='Transportadora de teste' && document.querySelector('select[aria-label="Tipo do novo espaço"]').value==='cyro.logistics'`,
    );
    await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const createShot = path.resolve(__dirname, '../../../build/v9/ev-create-menu.png');
    await fs.mkdir(path.dirname(createShot), { recursive: true });
    await fs.writeFile(createShot, (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector('form[aria-label="Criar Espaço Virtual"]').requestSubmit()`);
    await wait(
      `document.querySelector('.ev-chat-heading h1')?.textContent==='Transportadora de teste' && !document.getElementById('ev-message').disabled`,
    );
    await wait(`!!document.querySelector('#ev-chats button')`);
    await wait(`document.querySelector('.ev-chat-heading .ev-sdk-notice')?.textContent.includes('0.1.7')`);
    assert.equal(
      await js(
        `[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Novo Espaço Virtual').length`,
      ),
      1,
    );
    assert.equal(await js(`document.querySelectorAll('.ev-chat-heading button').length`), 2);
    await js(`document.querySelector('button[aria-label="Opções do EV"]').click()`);
    await wait(
      `document.getElementById('ev-manage').open && !!document.querySelector('#ev-manage input')`,
    );
    await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    await fs.writeFile(
      path.resolve(__dirname, '../../../build/v9/ev902-options.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(
      `[...document.querySelectorAll('#ev-manage button')].find(b=>b.textContent==='Limpar mensagens').click()`,
    );
    await wait(`document.querySelector('#ev-manage').textContent.includes('Confirmar limpeza')`);
    assert.ok(await js(`document.querySelector('#ev-manage').textContent.includes('memória')`));
    assert.equal(calls.filter(c=>c.action==='conversation.clear').length,0);
    await js(`[...document.querySelectorAll('#ev-manage button')].find(b=>b.textContent==='Confirmar limpeza').click()`);
    await wait(`!document.getElementById('ev-manage').open && !document.getElementById('ev-message').disabled`);
    assert.equal(calls.filter(c=>c.action==='conversation.clear').length,1);
    assert.equal(await js(`document.getElementById('ev-create-menu').open`),false);


    await js(`document.querySelector('button[aria-label="Studio"]').click()`);
    await js(`[...document.querySelectorAll('.ev-category-home button')].find(b=>b.textContent.trim()==='Documentos').click()`);
    await wait(`!!document.querySelector('.ev-notes li button')`);
    await rightClick('.ev-notes li button');
    assert.deepEqual(await js(`[...document.querySelectorAll('.context-menu [role="menuitem"]')]
      .map(item => item.textContent.trim())`), ['Visualizar', 'Analisar', 'Baixar original', 'Excluir']);
    await menuAction('Visualizar');
    await wait(`document.querySelector('.ev-note-detail')?.textContent.includes('150.00')`);
    assert.ok(
      await js(
        `document.querySelector('.ev-note-detail').textContent.includes('Documento fictício')`,
      ),
    );
    assert.ok(
      await js(
        `document.querySelector('.ev-note-detail').textContent.includes('O frete declarado é')`,
      ),
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
    await rightClick('.ev-chat-message.user');
    await wait(`!!document.querySelector('.context-menu [aria-label="Copiar mensagem"]')`);
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await wait(`!document.querySelector('.context-menu')`);
    const retries = calls.filter((c) => c.message === 'edite o primeiro frete para 22,50');
    assert.equal(retries[0].operationId, retries[1].operationId);
    await input('#ev-message', 'confirmar');
    await js(`document.querySelector('#ev-send').click()`);
    await wait(
      `!!document.querySelector('.ev-chat-table') && !document.getElementById('ev-message').disabled`,
    );
    await js(`document.querySelector('.ev-source-links button').click()`);
    await wait(`document.querySelector('.ev-source-row .ev-sheet-index')?.textContent === '51'`);
    assert.ok(await js(`!!document.querySelector('#ev-chats').offsetWidth`));
    assert.equal(await js(`document.querySelector('.ev-studio-toggle').nextElementSibling.getAttribute('aria-label')`), 'Opções do EV');
    await js(`document.querySelector('.ev-studio-resize').dispatchEvent(new KeyboardEvent('keydown', {key:'End', bubbles:true}))`);
    await wait(`document.querySelector('.ev-studio-resize').getAttribute('aria-valuenow') === '30'`);
    assert.ok(await js(`document.querySelector('.ev-studio').getBoundingClientRect().width <= innerWidth * .3 + .1`));
    assert.ok(await js(`!document.querySelector('table[aria-label="Editor da tabela"] input')`));
    await fs.writeFile(path.resolve(__dirname, '../../../build/v9/ev-studio-reference.png'), (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector('button[aria-label="Fechar painel"]').click()`);
    assert.ok(
      await js(
        `!!document.querySelector('#ev-attach-files') && !!document.querySelector('#ev-microphone') && !!document.querySelector('#ev-send')`,
      ),
    );
    const shots = path.resolve(__dirname, '../../../build/v9');
    await fs.mkdir(shots, { recursive: true });
    await fs.writeFile(
      path.join(shots, 'ev-notes-panel.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(`document.querySelector('button[aria-label="Studio"]').click()`);
    await wait(`!document.querySelector('.ev-chat').classList.contains('has-notes')`);
    await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    let capture;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        capture = await win.webContents.capturePage();
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    await fs.writeFile(path.join(shots, 'ev-logistics-chat.png'), capture.toPNG());
    await js(`document.querySelector('button[aria-label="Studio"]').click()`);
    await js(`[...document.querySelectorAll('.ev-category-nav button')].find(b=>b.textContent.trim()==='Códigos').click()`);
    await wait(`!!document.querySelector('.ev-studio:not([hidden]) .ev-resource-open')`);
    await js(
      `[...document.querySelectorAll('.ev-resource-open')].find(b=>b.textContent.includes('main.py')).click()`,
    );
    await wait(`!!document.querySelector('[aria-label="Painel de código"] textarea')`);
    assert.ok(await js(`document.querySelector('.ev-studio-explorer-heading').offsetHeight > 0 &&
      document.querySelector('.ev-category-nav').offsetHeight > 0 &&
      document.querySelector('.ev-studio-resource-scroll').offsetHeight === 0`));
    await new Promise((r) => setTimeout(r, 250));
    await fs.writeFile(
      path.join(shots, 'ev9-code-panel.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(`[...document.querySelectorAll('.ev-category-nav button')].find(b=>b.textContent.trim()==='Tabelas').click()`);
    await js(`document.querySelector('.ev-resource-table').click()`);
    await wait(`document.querySelector('.ev-studio-status')?.textContent === 'Somente leitura'`);
    assert.ok(await js(`!document.querySelector('table[aria-label="Editor da tabela"] input')`));
    assert.ok(await js(`document.querySelector('.ev-category-nav').offsetHeight > 0 &&
      document.querySelector('.ev-studio-explorer-heading').offsetHeight > 0 &&
      document.querySelector('.ev-studio-resource-scroll').offsetHeight === 0 &&
      Math.abs(document.querySelector('.ev-studio-panel').getBoundingClientRect().top -
        document.querySelector('.ev-category-nav').getBoundingClientRect().bottom) < 2`));
    await js(`[...document.querySelectorAll('.ev-category-nav button')].find(b=>b.textContent.trim()==='Tabelas').click()`);
    await rightClick('button[aria-label="Visualizar prazos"]');
    await menuAction('Editar');
    await wait(`!!document.querySelector('table[aria-label="Editor da tabela"] input')`);
    await new Promise((r) => setTimeout(r, 250));
    await fs.writeFile(
      path.join(shots, 'ev9-table-panel.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(`[...document.querySelectorAll('.ev-category-nav button')].find(b=>b.textContent.trim()==='Códigos').click()`);
    await rightClick('.ev-resource-open');
    await menuAction('Executar');
    await wait(`!!document.querySelector('iframe[title="Preview visual do EV"]')`);
    await new Promise((r) => setTimeout(r, 350));
    await fs.writeFile(
      path.join(shots, 'ev9-preview-panel.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(`document.querySelector('button[aria-label="Fechar Studio"]').click()`);
    await js(`document.querySelector('#settings-open').click()`);
    await wait(`!!document.querySelector('#settings-tabs')`);
    await js(
      `[...document.querySelectorAll('#settings-tabs button')].find(b=>b.textContent==='Catálogo de EVs').click()`,
    );
    await wait(`!!document.querySelector('#settings-content [data-extension="cyro.logistics"]')`);
    await js(`document.querySelector('#settings-content [data-extension="cyro.logistics"]').click()`);
    await wait(`document.querySelector('#settings-content .ev-sdk-notice')?.textContent.includes('SDK desatualizado')`);
    await js(
      `[...document.querySelectorAll('#settings-tabs button')].find(b=>b.textContent==='Memória').click()`,
    );
    await wait(
      `document.querySelector('.memory-summary')?.textContent.includes('respostas objetivas')`,
    );
    assert.ok(
      await js(
        `document.querySelector('textarea[aria-label="Mensagem sobre memória"]').placeholder.includes('lembre ou esqueça')`,
      ),
    );
    await js(`document.querySelector('.memory-toggle input').click()`);
    await wait(
      `!document.querySelector('.memory-toggle input').disabled && !document.querySelector('.memory-toggle input').checked`,
    );
    assert.equal(memoryControls.automatic, false);
    assert.equal(memoryControls.useExisting, true);
    await js(
      `[...document.querySelectorAll('.memory-panel button')].find(b=>b.textContent==='Limpar memória principal').click()`,
    );
    await wait(`!!document.querySelector('[aria-label="Confirmar alteração de memória"]')`);
    assert.equal(memoryFacts.length, 1);
    await js(
      `[...document.querySelectorAll('.memory-panel button')].find(b=>b.textContent==='Confirmar alteração').click()`,
    );
    await wait(
      `document.querySelector('.memory-chat')?.textContent.includes('Memória ativa limpa')`,
    );
    assert.equal(memoryFacts.length, 0);
    await fs.writeFile(
      path.join(shots, 'memory-v82-settings.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log(
      'V83_DESKTOP_PROCESS_METRICS ' +
        JSON.stringify({
          scenario: 'EV conversation and memory settings',
          memoryUnit: 'KiB',
          processes: app.getAppMetrics().map(({ type, cpu, memory }) => ({ type, cpu, memory })),
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log(
      'V83_DESKTOP_IDLE_METRICS ' +
        JSON.stringify({
          scenario: 'idle 3 seconds after interaction',
          memoryUnit: 'KiB',
          processes: app.getAppMetrics().map(({ type, cpu, memory }) => ({ type, cpu, memory })),
        }),
    );
    const renderer = app.getAppMetrics().find((m) => m.pid === win.webContents.getOSProcessId());
    console.log('V82_DESKTOP_MEMORY_METRICS ' + JSON.stringify(renderer?.memory || {}));
    assert.ok(
      calls.every(
        (c) =>
          c.action.startsWith('assistant.') ||
          c.action.startsWith('workbench.') ||
          c.action.startsWith('memory.') ||
          [
            'files.list',
            'tables.list',
            'table.read',
            'file.get',
            'catalog',
            'list',
            'create',
            'open',
            'conversation.read',
            'conversation.clear',
          ].includes(c.action),
      ),
    );
    console.log(
      'EV Electron: menu creation with name/type, one private chat, shared composer, retry, protected IPC, human confirmation and inline table passed.',
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

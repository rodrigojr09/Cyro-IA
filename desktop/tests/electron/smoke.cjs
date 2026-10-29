require('electron').ipcMain.handle('jarvis:workspace-ready', () => true);
const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
// Electron real com preload, navegação e dados fictícios; não usa a API externa.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
app.disableHardwareAcceleration();
// This legacy fixture does not run the clipboard service; its state stays disabled.
ipcMain.handle('clipboard:state', () => ({
  pending: false,
  owned: {},
  settings: { enabled: false },
}));
ipcMain.handle('spotify:request', () => ({ configured: false, status: 'disconnected' }));
ipcMain.handle('clipboard:claim', () => ({ ok: false, reason: 'DISABLED' }));
ipcMain.handle('jarvis:initial-settings', () => ({}));
ipcMain.handle('writer:dirty', () => {});
app.setPath(
  'userData',
  require('node:fs').mkdtempSync(path.join(app.getPath('temp'), 'jarvis-smoke-')),
);
let win, copied, speech, submittedChat, savedScope;
let quotaFull = false;
const projectId = '11111111-1111-4111-8111-111111111111',
  generalId = '22222222-2222-4222-8222-222222222222',
  firstId = '33333333-3333-4333-8333-333333333333',
  secondId = '44444444-4444-4444-8444-444444444444';
const project = {
  id: projectId,
  name: 'iPet',
  path: 'C:\\Fixtures\\iPet',
  ready: 1,
  state: 'ready',
  scope_confirmed: 1,
  knowledge_version: 2,
  progress: 'Memória atualizada',
};
const chats = [
  { id: firstId, project_id: projectId, title: 'Investigando a autenticação', archived: 0 },
  { id: secondId, project_id: projectId, title: 'Melhorias no feed', archived: 0 },
  { id: generalId, project_id: null, title: 'Ideias para a semana', archived: 0 },
];
const reply =
  '## Uma sessão segura começa no backend\n\nO fluxo de autenticação deve validar o token antes de carregar os dados do usuário.\n\n1. Confira a validade da sessão.\n2. Trate a resposta de acesso negado.\n\n| Camada | Responsabilidade |\n| --- | --- |\n| Backend | Validar sessão e permissões |\n| Frontend | Exibir estado de autenticação |\n\n```ts\nexport async function getCurrentUser() {\n  const response = await fetch("/api/me");\n  if (!response.ok) throw new Error("Sessão inválida");\n  return response.json();\n}\n```\n\n**Hipótese:** investigue o tratamento de expiração no arquivo `backend/index.ts:2`. Aplique o exemplo manualmente. Nenhum arquivo foi alterado.';
const timer = setTimeout(() => {
  console.error('Tempo de teste excedido');
  app.exit(1);
}, 45000);
const pastedImageId = '77777777-7777-4777-8777-777777777777';
let pasteRequests = 0;
ipcMain.handle('jarvis:attachments-paste-image', (_event, value) => {
  pasteRequests++;
  assert.equal(value.type, 'image/png');
  return {
    ok: true,
    data: {
      files: [
        {
          id: pastedImageId,
          name: 'Imagem colada.png',
          kind: 'image',
          size: 3,
          preview: 'data:image/png;base64,' + value.data,
        },
      ],
    },
  };
});
let dropRequests = 0;
ipcMain.handle('jarvis:attachments-drop-file', (_, value) => {
  dropRequests++;
  assert.equal(value.name, 'notas.txt');
  assert.equal(Buffer.from(value.data, 'base64').toString(), 'Notas locais');
  return {
    ok: true,
    data: {
      files: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          name: value.name,
          kind: 'document',
          size: 12,
        },
      ],
    },
  };
});
ipcMain.handle('jarvis:attachments-discard', () => ({ ok: true }));
ipcMain.handle('jarvis:voice-preference', () => {});
ipcMain.handle('jarvis:audio-claim', () => {});
ipcMain.handle('jarvis:quick-settings', () => ({
  opacity: 0.82,
  wpm: 200,
  minSeconds: 5,
  maxSeconds: 30,
  voice: false,
  closeToTray: true,
}));
ipcMain.handle('jarvis:quick-configure', (_, value) => value);
ipcMain.handle('jarvis:copy-code', (_, text) => {
  copied = text;
  return true;
});
ipcMain.handle('jarvis:open-link', () => true);
ipcMain.handle('jarvis:manage-chat', (_, id, action) => {
  const item = chats.find((c) => c.id === id);
  if (action === 'archive') item.archived = 1;
  if (action === 'restore') item.archived = 0;
  return { ok: true, data: {} };
});
ipcMain.handle('jarvis:clear-storage', () => {
  quotaFull = false;
  return { ok: true, data: { cleared: true } };
});
ipcMain.handle('jarvis:api', (_, route, options) => {
  let data;
  if (route === '/health') data = { ok: true };
  else if (route === '/storage')
    data = {
      local: { usedBytes: 2097152 },
      cloud: {
        usedBytes: quotaFull ? 52428800 : 1048576,
        limitBytes: 52428800,
        blocked: quotaFull,
      },
    };
  else if (route === '/chats/settings') {
    const input = JSON.parse(options.body);
    data = chats.find((c) => c.id === input.chat_id);
    Object.assign(data, { title: input.title, instructions: input.instructions });
  } else if (route === '/workspace' || route === '/workspace/bootstrap')
    data = {
      projects: [project],
      chats,
      general_chat_id: generalId,
      histories: Object.fromEntries(
        chats.map((chat) => [
          chat.id,
          chat.id === secondId
            ? [{ id: 1, role: 'user', content: 'Assunto independente do feed' }]
            : [],
        ]),
      ),
    };
  else if (route === '/workspace/view')
    data = JSON.parse(options.body).project_id
      ? { project, chats: chats.filter((c) => c.project_id), archived_chats: [] }
      : { project: null, chats: chats.filter((c) => !c.project_id), archived_chats: [] };
  else if (route.startsWith('/chats/history?')) {
    const id = new URLSearchParams(route.split('?')[1]).get('chat_id');
    data = {
      chat: chats.find((c) => c.id === id),
      messages:
        id === secondId ? [{ id: 1, role: 'user', content: 'Assunto independente do feed' }] : [],
    };
  } else if (route === '/chats/create') {
    data = {
      id: '55555555-5555-4555-8555-555555555555',
      project_id: JSON.parse(options.body).project_id,
      title: 'Nova conversa',
      archived: 0,
    };
    chats.push(data);
  } else if (route === '/programming/status')
    data = { progress: 'Pronto', project: null, roots: [] };
  else if (route === '/projects/selection/size')
    data = { selected_bytes: 1024, max_bytes: 5242880, within_limit: true };
  else if (route === '/chat') {
    submittedChat = JSON.parse(options.body).chat_id;
    data = {
      reply,
      speech_text: 'Revise a validade da sessão. O exemplo está no chat.',
      pending_actions: [],
    };
  } else if (route === '/speak') {
    speech = JSON.parse(options.body).message;
    return { ok: false, data: { detail: 'Voz simulada no teste' } };
  } else if (route.startsWith('/projects/selection?'))
    data = {
      selection: { confirmed: true, include: ['.'], exclude: [] },
      next_offset: null,
      entries: [
        { name: 'src', path: 'src', type: 'directory' },
        {
          name: 'package-lock.json',
          path: 'package-lock.json',
          type: 'file',
          disabled: true,
          reason: 'Lock ignorado',
        },
        { name: 'dist', path: 'dist', type: 'directory', disabled: true, reason: 'Build ignorado' },
      ],
    };
  else if (route === '/projects/selection/save') {
    savedScope = JSON.parse(options.body);
    data = { ...project, selection_changed: true };
  } else throw new Error('Rota inesperada: ' + route);
  return { ok: true, data };
});
const js = (code) => win.webContents.executeJavaScript(code);
async function frame() {
  await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
}
async function shot(name) {
  await frame();
  await new Promise((resolve) => setTimeout(resolve, 150));
  await fs.writeFile(
    path.join(app.getPath('temp'), name),
    (await win.webContents.capturePage()).toPNG(),
  );
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await js(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error('React smoke timeout: ' + expression);
}
async function enter(selector, value) {
  await js(
    `(()=>{const node=document.querySelector(${JSON.stringify(selector)});const kind=node.tagName==='TEXTAREA'?HTMLTextAreaElement:node.tagName==='SELECT'?HTMLSelectElement:HTMLInputElement;Object.getOwnPropertyDescriptor(kind.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await frame();
}
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({
      width: 1366,
      height: 738,
      minWidth: 800,
      minHeight: 560,
      show: false,
      webPreferences: {
        preload: path.join(DESKTOP_ROOT, 'scripts/app/preload.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
      },
    });
    await win.loadFile(path.join(DESKTOP_ROOT, 'index.html'));
    await waitFor(`document.getElementById('status')?.textContent==='Conectado'`);
    assert.equal(await js(`typeof require`), 'undefined');
    assert.equal(await js(`document.getElementById('welcome').hidden`), false);
    assert.equal(await js(`document.querySelectorAll('.suggestions button').length`), 6);
    assert.equal(await js(`document.querySelectorAll('#sidebar select').length`), 0);
    await shot('cyro-v603-home.png');
    // Sidebar action alignment and anchored popup geometry use real Chromium layout.
    const actionLayout = await js(`(() => {
      const general = document.querySelector('#new-general-chat').getBoundingClientRect();
      const project = document.querySelector('.project-row .navigation-add').getBoundingClientRect();
      const row = document.querySelector('.project-row').getBoundingClientRect();
      return { edge: Math.abs(general.right-project.right), center: Math.abs((project.top+project.bottom-row.top-row.bottom)/2) };
    })()`);
    assert.ok(actionLayout.edge < 1);
    assert.ok(actionLayout.center < 1);
    await js(`document.querySelector('.project-row .navigation-add').click()`);
    await waitFor(`document.querySelector('.workspace-action-menu')?.style.visibility==='visible'`);
    assert.equal(
      await js(`(() => {
      const menu=document.querySelector('.workspace-action-menu').getBoundingClientRect();
      const side=document.querySelector('#sidebar').getBoundingClientRect();
      return menu.left >= side.right+7 && menu.right <= innerWidth-7 && menu.bottom <= innerHeight-7;
    })()`),
      true,
    );
    await shot('cyro-sidebar-create-menu.png');
    await js(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
    );
    await waitFor(`!document.querySelector('.workspace-action-menu')`);
    await js(
      `document.querySelector('.chat-item').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))`,
    );
    await waitFor(`document.querySelector('.workspace-action-menu')?.style.visibility==='visible'`);
    assert.equal(
      await js(
        `document.querySelector('.workspace-action-menu').getBoundingClientRect().left >= document.querySelector('#sidebar').getBoundingClientRect().right+7`,
      ),
      true,
    );
    await shot('cyro-sidebar-context-menu.png');
    await js(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`,
    );
    assert.equal(await js(`document.activeElement.getAttribute('role')`), 'menuitem');
    await js(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
    );
    await waitFor(`!document.querySelector('.workspace-action-menu')`);

    await js(`document.querySelector('.project-item').click()`);
    await waitFor(`document.getElementById('project-name').textContent==='iPet'`);
    await js(`document.querySelector('.chat-item[title="Investigando a autenticação"]').click()`);
    await waitFor(`document.getElementById('conversation-name').dataset.chatId==='${firstId}'`);
    await enter('#input', 'Oi');
    await js(`document.getElementById('send').click()`);
    await waitFor(`!!document.querySelector('.code-block button')`);
    assert.equal(submittedChat, firstId);
    await js(`document.querySelector('.code-block button').click()`);
    await waitFor(`document.querySelector('.code-block button').textContent==='Copiado'`);
    assert.match(copied, /export async function/);
    assert.equal(await js(`document.querySelectorAll('#messages table').length`), 1);
    assert.equal(await js(`document.querySelectorAll('#messages script').length`), 0);
    assert.ok(await js(`document.querySelectorAll('#messages .hljs-keyword').length>0`));
    for (const [width, height] of [
      [1366, 738],
      [800, 600],
    ]) {
      win.setSize(width, height);
      await frame();
      await js(
        `(() => {const scroll=document.getElementById('conversation-scroll');scroll.scrollTop=0;scroll.dispatchEvent(new Event('scroll'));})()`,
      );
      await frame();
      const geometry = await js(`(() => {
        const input=document.querySelector('.composer').getBoundingClientRect();
        const jump=document.getElementById('jump-bottom');
        const actions=[...document.querySelectorAll('.composer-actions button:not([hidden])')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect());
        return {overlap:!jump.hidden && getComputedStyle(jump.parentElement).display!=='none' && jump.getBoundingClientRect().bottom>input.top,
          overflow:document.documentElement.scrollWidth>innerWidth,
          gaps:actions.slice(1).map((r,i)=>r.left-actions[i].right), font:getComputedStyle(document.getElementById('input')).fontFamily};
      })()`);
      assert.equal(geometry.overlap, false);
      assert.equal(geometry.overflow, false);
      assert.ok(geometry.gaps.every((gap) => gap >= 9));
      assert.match(geometry.font, /system-ui/);
      await js(
        `document.querySelector('.chat-item.active').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))`,
      );
      await waitFor(`document.querySelector('.ui-action-menu')?.style.visibility==='visible'`);
      assert.equal(
        await js(
          `(() => {const m=document.querySelector('.ui-action-menu').getBoundingClientRect(); const side=document.getElementById('sidebar').getBoundingClientRect(); return m.left>=side.right+7 && m.right<=innerWidth-7 && m.top>=7 && m.bottom<=innerHeight-7;})()`,
        ),
        true,
      );
      await js(
        `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
      );
      await waitFor(`!document.querySelector('.ui-action-menu')`);
      const copyLayout = await js(`(() => {
        const message=[...document.querySelectorAll('.message.user')].at(-1);
        const button=message.querySelector('.message-copy');const label=button.querySelector('span');
        const r=button.getBoundingClientRect();const s=getComputedStyle(button);const scroll=document.getElementById('conversation-scroll').getBoundingClientRect();
        return {nowrap:s.whiteSpace,lines:label.getClientRects().length,width:r.width,inside:r.left>=scroll.left && r.right<=scroll.right,space:parseFloat(getComputedStyle(document.getElementById('messages')).gap),height:r.height};
      })()`);
      assert.equal(copyLayout.nowrap, 'nowrap');
      assert.equal(copyLayout.lines, 1);
      assert.ok(copyLayout.width >= 160);
      assert.equal(copyLayout.inside, true);
      assert.ok(copyLayout.space >= copyLayout.height + 8);
      await shot('cyro-v603-chat-' + width + '.png');
    }
    win.setSize(1366, 738);
    await frame();
    await shot('cyro-v603-chat.png');
    await js(`document.querySelector('.message.user .message-copy').focus()`);
    await shot('cyro-v622-copy-action.png');
    const copyText = await js(`document.querySelector('.message.user p').textContent`);
    await js(`document.querySelector('.message.user .message-copy').click()`);
    await waitFor(
      `document.querySelector('.message.user .message-copy span').textContent==='Copiado'`,
    );
    assert.equal(copied, copyText);

    await waitFor(`!document.getElementById('send').disabled`);
    await js(`document.querySelector('.chat-item[title="Melhorias no feed"]').click()`);
    await waitFor(
      `document.getElementById('messages').textContent.includes('Assunto independente')`,
    );
    assert.equal(await js(`document.querySelectorAll('#messages pre').length`), 0);
    const chatBeforePaste = submittedChat;
    await js(
      `(() => {const data=new DataTransfer();const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));data.items.add(new File([bytes],'paste.png',{type:'image/png'}));document.getElementById('input').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));})()`,
    );
    await waitFor(`!!document.querySelector('#attachment-list .attachment-card img')`);
    await waitFor(`document.querySelector('#attachment-list img')?.naturalWidth>0`);
    assert.equal(pasteRequests, 1);
    assert.match(
      await js(`document.querySelector('#attachment-list .attachment-privacy').textContent`),
      /Prévia local/,
    );
    assert.equal(submittedChat, chatBeforePaste);
    await js(`document.querySelector('#attachment-list button[aria-label^="Remover"]').click()`);
    await waitFor(`!document.querySelector('#attachment-list .attachment-card')`);

    await js(
      `(() => {const data=new DataTransfer();data.items.add(new File(['Notas locais'],'notas.txt',{type:'text/plain'}));document.querySelector('.composer').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));})()`,
    );
    await waitFor(`!!document.querySelector('#attachment-list .attachment-card')`);
    assert.equal(dropRequests, 1);
    assert.equal(submittedChat, chatBeforePaste);
    const attachmentStyle = await js(
      `(() => {const c=document.querySelector('#attachment-list .attachment-card');const s=getComputedStyle(c);return {radius:s.borderRadius,padding:s.padding,background:s.backgroundColor,surface:getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),save:c.textContent.includes('Salvar cópia'),preview:c.textContent.includes('Ver prévia')};})()`,
    );
    assert.equal(attachmentStyle.radius, '10px');
    assert.equal(attachmentStyle.padding, '8px');
    assert.equal(attachmentStyle.save, true);
    assert.equal(attachmentStyle.preview, true);
    await shot('cyro-v621-attachment.png');
    await js(`document.querySelector('#attachment-list button[aria-label^="Remover"]').click()`);
    await waitFor(`!document.querySelector('#attachment-list .attachment-card')`);
    await js(`document.getElementById('manage-open').click()`);
    await waitFor(`!!document.querySelector('.workspace-action-menu')`);
    assert.equal(
      await js(
        `document.querySelector('.workspace-action-menu').textContent.includes('Mensagens anteriores') && document.querySelector('.workspace-action-menu').textContent.includes('Limpar mensagens')`,
      ),
      true,
    );
    await js(`document.querySelector('.workspace-action-menu button').click()`);
    await waitFor(`document.getElementById('manage-dialog').open`);
    const manageLayout = await js(
      `(() => { const field=document.getElementById('chat-instructions').getBoundingClientRect();const footer=document.querySelector('.manage-dialog-actions').getBoundingClientRect();const actions=[...document.querySelectorAll('.manage-secondary-actions button')].map(x=>x.getBoundingClientRect());return {gap:footer.top-field.bottom,overlap:actions.some((a,i)=>actions.some((b,j)=>i!==j && a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top)),overflow:document.getElementById('manage-dialog').scrollWidth>document.getElementById('manage-dialog').clientWidth};})()`,
    );
    assert.ok(manageLayout.gap >= 23);
    assert.equal(manageLayout.overlap, false);
    assert.equal(manageLayout.overflow, false);
    await shot('cyro-manage-dialog-layout.png');

    await js(`document.querySelector('#manage-dialog .dialog-header button').click()`);
    await js(`document.getElementById('project-name').click()`);
    await waitFor(`document.getElementById('project-settings-dialog').open`);
    await js(`document.getElementById('project-select-sources').click()`);
    await waitFor(
      `document.getElementById('scope-dialog').open && document.querySelectorAll('#scope-list input').length===3`,
    );
    assert.equal(await js(`document.querySelectorAll('#scope-list input:disabled').length`), 2);
    await js(`document.getElementById('scope-none').click()`);
    await frame();
    await js(`document.getElementById('scope-save').click()`);
    await waitFor(`!document.getElementById('scope-dialog').open`);
    assert.deepEqual(savedScope.include, []);
    await js(`document.getElementById('settings-open').click()`);
    await waitFor(`!document.getElementById('settings-dialog').hidden`);
    await js(
      `Array.from(document.querySelectorAll('#settings-tabs button')).find(node=>node.textContent==='Integrações').click()`,
    );
    await waitFor(`document.querySelectorAll('.integration-card').length===6`);
    await enter('#integrations-search', 'Spotify');
    assert.equal(await js(`document.querySelectorAll('.integration-card').length`), 1);
    await js(`document.querySelector('.integration-card').click()`);
    await waitFor(`document.getElementById('integration-details-name')?.textContent==='Spotify'`);
    assert.equal(await js(`document.querySelectorAll('audio').length`), 0);
    await js(`document.getElementById('integration-details-back').click()`);
    await waitFor(`!!document.getElementById('integrations-search')`);
    assert.equal(await js(`document.getElementById('integrations-search').value`), 'Spotify');
    await shot('cyro-v603-integrations.png');
    await js(
      `Array.from(document.querySelectorAll('#settings-tabs button')).find(node=>node.textContent==='Aparência').click()`,
    );
    await waitFor(`!!document.getElementById('setting-theme')`);
    await enter('#setting-theme', 'light');
    assert.equal(await js(`document.documentElement.dataset.theme`), 'light');
    await enter('#setting-theme', 'dark');
    await js(`document.getElementById('setting-large').click()`);
    await frame();
    assert.equal(await js(`document.body.classList.contains('large-text')`), true);
    await js(`document.getElementById('setting-large').click()`);
    quotaFull = true;
    await js(
      `Array.from(document.querySelectorAll('#settings-tabs button')).find(node=>node.textContent==='Armazenamento').click()`,
    );
    await waitFor(`!!document.querySelector('.storage-blocked')`);
    assert.equal(await js(`document.getElementById('send').disabled`), true);
    await js(
      `Array.from(document.querySelectorAll('#storage-usage button')).find(node=>node.textContent==='Apagar chats na nuvem').click()`,
    );
    await waitFor(`document.getElementById('settings-dialog').hidden`);
    assert.equal(quotaFull, false);
    await shot('cyro-v603-storage.png');
    clearTimeout(timer);
    win.destroy();
    console.log(
      'React + Electron: bootstrap, navegação, histórico, envio, Markdown seguro, cópia, seleção de arquivos, integrações, temas e cota aprovados (Cloud sintético). Capturas cyro-v603-*.png no diretório temporário.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    clearTimeout(timer);
    win?.destroy();
    app.exit(1);
  }
});

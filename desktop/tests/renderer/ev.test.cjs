const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, input, click, act, settle } = require('../helpers/react.cjs');
const submit = async () => click('#ev-send');

test('EV catalog installs for the account and creation sends the chosen extension type', async () => {
  const env = environment(),
    calls = [];
  const projectId = '77777777-7777-4777-8777-777777777777';
  let installed = false;
  const catalog = () => ({
    enabled: true,
    extensions: [
      {
        id: 'cyro.logistics',
        name: 'Cyro Logístico',
        description: 'Transporte',
        version: '1.0.0',
        permissions: ['storage', 'messages', 'files'],
        installed,
      },
    ],
  });
  window.cyroEV = {
    dirty: async () => {},
    draft: async () => null,
    request: async (command) => {
      if (command.action === 'workbench.list')
        return { revision: 0, files: [], tables: [], executions: [] };
      if (command.action === 'tables.list') return { tables: [] };
      calls.push(command);
      if (command.action === 'catalog') return catalog();
      if (command.action === 'extension.install') {
        installed = true;
        return catalog();
      }
      if (command.action === 'create')
        return {
          ownerId: 'owner',
          space: {
            id: projectId,
            name: command.name,
            extensionId: command.extensionId,
            state: 'READY',
          },
        };
      if (command.action === 'assistant.open')
        return {
          ownerId: 'owner',
          space: {
            id: projectId,
            name: 'Minha transportadora',
            extensionId: 'cyro.logistics',
            state: 'READY',
          },
          conversation: null,
          conversations: [],
          messages: [],
          artifacts: [],
        };
      if (command.action === 'files.list') return { files: [] };
      throw Error('Unexpected ' + command.action);
    },
  };
  try {
    await env.mount(env.EVWorkspace, { hidden: false, createRequest: 1 });
    await settle();
    assert.equal(document.querySelector('.ev-chat'), null);
    assert.equal(document.querySelector('#ev-message'), null);
    assert.equal(document.querySelector('select[aria-label="Tipo do novo espaço"]').value, '');
    await act(async () => {
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent === 'Explorar catálogo')
        .click();
    });
    assert.equal(document.querySelector('#ev-extension-menu').open, true);
    await input('#ev-catalog-search', 'inexistente');
    assert.equal(document.querySelectorAll('#ev-extension-menu .integration-card').length, 0);
    await input('#ev-catalog-search', 'logístico');
    await click('#ev-extension-menu .integration-card');
    await act(async () => {
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent === 'Instalar Cyro Logístico')
        .click();
    });
    assert.equal(
      document.querySelector('select[aria-label="Tipo do novo espaço"]').value,
      'cyro.logistics',
    );
    await click(
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Voltar à criação'),
    );
    await input('input[aria-label="Nome do espaço"]', 'Minha transportadora');
    await act(async () => {
      document
        .querySelector('form[aria-label="Criar Espaço Virtual"]')
        .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(calls.find((c) => c.action === 'create').extensionId, 'cyro.logistics');
    assert.equal(document.querySelector('.ev-chat-heading h1').textContent, 'Minha transportadora');
  } finally {
    await env.dispose();
  }
});

test('EV chat keeps inline results, confirmation and retry on the same operation', async () => {
  const env = environment(),
    calls = [],
    drafts = [];
  const id = '11111111-1111-4111-8111-111111111111',
    conversationId = '22222222-2222-4222-8222-222222222222';
  const space = { id, name: 'Minha transportadora', state: 'READY' };
  let fail = true;
  window.cyroEV = {
    dirty: async () => {},
    draft: async (value) => {
      drafts.push(value);
      return null;
    },
    request: async (c) => {
      if (c.action === 'workbench.list')
        return { revision: 0, files: [], tables: [], executions: [] };
      if (c.action === 'tables.list') return { tables: [] };
      calls.push(c);
      if (c.action === 'catalog') return { enabled: false, extensions: [] };
      if (c.action === 'files.list') return { files: [], next: null };
      if (c.action === 'assistant.open')
        return {
          ownerId: 'owner',
          space,
          conversation: { id: conversationId },
          messages: [],
          artifacts: [],
        };
      if (c.action === 'assistant.send' && c.message.startsWith('crie'))
        return { ownerId: 'owner', space, effect: 'OPEN_SPACE', reply: 'Espaço criado.' };
      if (c.action === 'assistant.send') {
        if (fail) return { error: 'Conexão interrompida.', status: 0 };
        return {
          ownerId: 'owner',
          space,
          conversation: { id: conversationId },
          messages: [
            { id: 1, role: 'user', content: c.message },
            { id: 2, role: 'assistant', content: 'Preparei uma proposta.' },
          ],
          artifacts: [
            {
              messageId: 2,
              items: [
                {
                  type: 'PROPOSAL',
                  id: '55555555-5555-4555-8555-555555555555',
                  summary: 'Editar o frete da primeira linha.',
                  changes: [{ label: 'Frete', before: '10,00', after: '15,50' }],
                },
              ],
            },
          ],
        };
      }
      throw Error('Unexpected ' + c.action);
    },
  };
  try {
    await env.mount(env.EVWorkspace, {
      hidden: false,
      selectedEV: { ...space, chatId: conversationId },
    });
    assert.ok(document.querySelector('#ev-attach-files'));
    assert.ok(document.querySelector('#ev-microphone'));
    assert.ok(document.querySelector('#ev-send'));
    assert.equal(document.querySelector('.ev-tabs'), null);
    assert.equal(document.querySelector('.ev-chat-heading h1').textContent, 'Minha transportadora');
    await input('#ev-message', 'edite o primeiro frete para 15,50');
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    assert.equal(
      drafts.find((d) => d.operation === 'write').content.question,
      'edite o primeiro frete para 15,50',
    );
    await submit();
    assert.match(document.querySelector('[role="alert"]').textContent, /Conexão interrompida/);
    assert.equal(document.querySelector('#ev-message').value, 'edite o primeiro frete para 15,50');
    fail = false;
    await submit();
    const sends = calls.filter((c) => c.message === 'edite o primeiro frete para 15,50');
    assert.equal(sends[0].operationId, sends[1].operationId);
    assert.match(document.querySelector('.ev-chat-proposal').textContent, /confirmar/);
    assert.ok(document.querySelector('#ev-attach-files'));
    assert.ok(document.querySelector('#ev-microphone'));
    assert.ok(document.querySelector('#ev-send'));
    assert.ok(drafts.some((d) => d.operation === 'remove'));
    assert.equal(document.querySelector('#ev-message').value, '');
  } finally {
    await env.dispose();
  }
});
test('EV shared composer attaches scoped files, removes only context, dictates text and sends attachment-only messages', async () => {
  const env = environment(),
    calls = [],
    uploads = [],
    downloads = [],
    drafts = [];
  const projectId = '11111111-1111-4111-8111-111111111111';
  const fileId = '33333333-3333-4333-8333-333333333333';
  const space = { id: projectId, name: 'Fretes', state: 'READY' };
  let recognition;
  window.jarvisWindow = { permitMicrophone: async () => true };
  window.SpeechRecognition = class {
    start() {
      recognition = this;
    }
    abort() {
      this.onend?.();
    }
  };
  window.cyroEV = {
    dirty: async () => {},
    draft: async (value) => {
      drafts.push(value);
      return null;
    },
    upload: async (id) => {
      uploads.push(id);
      return { files: [{ id: fileId, name: 'nota.xml', size: 200, mimeType: 'application/xml' }] };
    },
    download: async (value) => {
      downloads.push(value);
      return { ok: true };
    },
    request: async (c) => {
      if (c.action === 'workbench.list')
        return { revision: 0, files: [], tables: [], executions: [] };
      if (c.action === 'tables.list') return { tables: [] };
      calls.push(c);
      if (c.action === 'catalog') return { enabled: false, extensions: [] };
      if (c.action === 'files.list') return { files: [], next: null };
      if (c.action === 'assistant.open')
        return {
          space,
          conversation: { id: '22222222-2222-4222-8222-222222222222' },
          messages: [],
        };
      if (c.message.startsWith('crie')) return { space, effect: 'OPEN_SPACE' };
      return { space, reply: 'Arquivo recebido para conferência.' };
    },
  };
  try {
    await env.mount(env.EVWorkspace, {
      hidden: false,
      selectedEV: { ...space, chatId: '22222222-2222-4222-8222-222222222222' },
    });
    assert.equal(document.querySelector('#ev-microphone').disabled, false);
    await click('#ev-microphone');
    await act(async () => recognition.onresult({ results: [[{ transcript: 'Confira o frete' }]] }));
    assert.equal(document.querySelector('#ev-message').value, 'Confira o frete');
    await input('#ev-message', '');
    await click('#ev-attach-files');
    assert.deepEqual(uploads, [projectId]);
    assert.match(document.querySelector('.composer-attachments').textContent, /nota.xml/);
    await click('[aria-label="Baixar nota.xml"]');
    assert.deepEqual(downloads, [{ projectId, fileId }]);
    await click('[aria-label="Remover nota.xml"]');
    assert.equal(document.querySelector('.attachment-card'), null);
    assert.equal(
      calls.some((c) => c.action === 'file.delete'),
      false,
    );
    await click('#ev-attach-files');
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    assert.ok(drafts.some((d) => d.content?.fileIds?.includes(fileId)));
    await submit();
    const send = calls.find((c) => c.message === 'Analise os arquivos anexados.');
    assert.deepEqual(send.fileIds, [fileId]);
    assert.equal(document.querySelector('.attachment-card'), null);
    assert.equal(document.querySelector('#ev-message').value, '');
  } finally {
    await env.dispose();
  }
});

test('notes sidebar shows uploaded fiscal data, warnings and saved chat analysis without sending a message', async () => {
  const env = environment(),
    calls = [];
  const projectId = '11111111-1111-4111-8111-111111111111',
    fileId = '33333333-3333-4333-8333-333333333333';
  const space = { id: projectId, name: 'Notas', state: 'READY' };
  const file = { id: fileId, name: 'nota-teste.xml', status: 'PROCESSED' };
  window.cyroEV = {
    dirty: async () => {},
    draft: async () => null,
    request: async (c) => {
      if (c.action === 'workbench.list')
        return { revision: 0, files: [], tables: [], executions: [] };
      if (c.action === 'tables.list') return { tables: [] };
      calls.push(c);
      if (c.action === 'catalog') return { enabled: false, extensions: [] };
      if (c.action === 'files.list') return { files: [file], next: null };
      if (c.action === 'file.get')
        return {
          file,
          extracted: {
            type: 'FISCAL',
            documentType: 'NFE',
            number: '12345',
            total: '1450.00',
            freight: { value: '150.00' },
            weight: '82',
            warnings: ['Chave fictícia; validação oficial não realizada.'],
          },
          analyses: [
            {
              id: 'saved-analysis',
              kind: 'CHAT',
              state: 'DONE',
              createdAt: '2026-11-04T12:00:00Z',
              reply: 'O frete declarado nesta nota é 150.00.',
            },
          ],
        };
      if (c.action === 'assistant.open')
        return {
          space,
          conversation: { id: '22222222-2222-4222-8222-222222222222' },
          messages: [],
        };
      return { space, effect: 'OPEN_SPACE' };
    },
  };
  try {
    await env.mount(env.EVWorkspace, {
      hidden: false,
      selectedEV: { ...space, chatId: '22222222-2222-4222-8222-222222222222' },
    });
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    await click('button[aria-label="Notas e arquivos"]');
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    const list = document.querySelector('.ev-notes li button');
    assert.match(list.textContent, /nota-teste.xml/);
    await click(list);
    assert.match(document.querySelector('.ev-note-detail').textContent, /150.00/);
    assert.match(document.querySelector('.ev-note-detail').textContent, /Chave fictícia/);
    assert.match(
      document.querySelector('.ev-note-detail').textContent,
      /frete declarado nesta nota/,
    );
    assert.equal(calls.filter((c) => c.action === 'assistant.send').length, 0);
    await click('.ev-note-detail > button');
    assert.match(document.querySelector('#ev-attachment-list').textContent, /nota-teste.xml/);
    assert.equal(document.querySelector('#ev-message').value, '');
    assert.ok(calls.filter((c) => c.action === 'file.get').every((c) => c.projectId === projectId));
  } finally {
    await env.dispose();
  }
});

test('EV has one private chat; history loads only after choosing that EV and is cached', async () => {
  const env = environment(),
    calls = [];
  const one = {
    id: '11111111-1111-4111-8111-111111111111',
    chatId: '22222222-2222-4222-8222-222222222222',
    name: 'Fretes',
    state: 'READY',
  };
  const two = {
    id: '33333333-3333-4333-8333-333333333333',
    chatId: '44444444-4444-4444-8444-444444444444',
    name: 'Prazos',
    state: 'READY',
  };
  window.cyroEV = {
    dirty: async () => {},
    draft: async () => null,
    request: async (c) => {
      if (c.action === 'workbench.list')
        return { revision: 0, files: [], tables: [], executions: [] };
      if (c.action === 'tables.list') return { tables: [] };
      calls.push(c);
      if (c.action === 'catalog') return { enabled: true, extensions: [] };
      if (c.action === 'files.list') return { files: [] };
      if (c.action === 'assistant.open') {
        const space = c.projectId === one.id ? one : two;
        return {
          ownerId: 'owner',
          space,
          conversation: { id: space.chatId },
          messages: [{ id: 1, role: 'assistant', content: 'Histórico ' + space.name }],
          artifacts: [],
        };
      }
      throw Error('Unexpected ' + c.action);
    },
  };
  try {
    await env.mount(env.EVWorkspace, { hidden: false });
    assert.equal(calls.filter((c) => c.action === 'assistant.open').length, 0);
    await env.mount(env.EVWorkspace, { hidden: false, selectedEV: one });
    assert.match(document.querySelector('.ev-chat-history').textContent, /Histórico Fretes/);
    assert.equal(document.querySelector('select[aria-label="Conversa do espaço"]'), null);
    await env.mount(env.EVWorkspace, { hidden: false, selectedEV: two });
    await env.mount(env.EVWorkspace, { hidden: false, selectedEV: one });
    assert.equal(calls.filter((c) => c.action === 'assistant.open').length, 2);
    assert.equal(calls.filter((c) => c.action === 'conversation.create').length, 0);
  } finally {
    await env.dispose();
  }
});

test('EV refreshes its installed version on focus without fetching chat history again', async () => {
  const env = environment(),
    calls = [];
  let version = '1.0.0';
  const space = {
    id: '11111111-1111-4111-8111-111111111111',
    chatId: '22222222-2222-4222-8222-222222222222',
    name: 'EV atualizado',
    extensionId: 'studio.test',
    extensionVersion: '1.0.0',
    state: 'READY',
  };
  window.cyroEV = {
    dirty: async () => {},
    draft: async () => null,
    request: async (c) => {
      calls.push(c);
      if (c.action === 'catalog')
        return {
          enabled: true,
          automaticUpdates: true,
          extensions: [
            {
              id: space.extensionId,
              version,
              installedVersion: version,
              installed: true,
              name: 'Teste',
            },
          ],
        };
      if (c.action === 'assistant.open')
        return {
          ownerId: 'owner',
          space,
          conversation: { id: space.chatId },
          messages: [{ id: 1, role: 'user', content: 'Histórico preservado' }],
          artifacts: [],
        };
      if (c.action === 'files.list') return { files: [] };
      throw Error(c.action);
    },
  };
  try {
    await env.mount(env.EVWorkspace, { hidden: false, selectedEV: space });
    await settle();
    assert.match(document.querySelector('.ev-chat-heading').textContent, /v1.0.0/);
    version = '1.1.0';
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    await settle();
    assert.match(document.querySelector('.ev-chat-heading').textContent, /v1.1.0/);
    assert.match(document.querySelector('.ev-chat-history').textContent, /Histórico preservado/);
    assert.equal(calls.filter((c) => c.action === 'assistant.open').length, 1);
  } finally {
    await env.dispose();
  }
});

test('EV clears the submitted composer immediately and releases busy when the reply arrives even if draft cleanup stalls', async () => {
  const env = environment(),
    id = '11111111-1111-4111-8111-111111111111',
    chatId = '22222222-2222-4222-8222-222222222222';
  const space = { id, name: 'EV de teste', state: 'READY', chatId };
  let resolveReply, rejectCleanup;
  const response = new Promise((resolve) => {
      resolveReply = resolve;
    }),
    cleanup = new Promise((_, reject) => {
      rejectCleanup = reject;
    });
  window.cyroEV = {
    dirty: async () => {},
    draft: async (c) => (c.operation === 'remove' ? cleanup : null),
    request: async (c) => {
      if (c.action === 'catalog') return { extensions: [] };
      if (c.action === 'assistant.open')
        return { space, conversation: { id: chatId }, messages: [], artifacts: [] };
      if (c.action === 'assistant.send') return response;
      if (c.action === 'workbench.list')
        return { revision: 0, files: [], tables: [], executions: [] };
      if (c.action === 'tables.list') return { tables: [] };
      throw Error(c.action);
    },
  };
  try {
    await env.mount(env.EVWorkspace, { hidden: false, selectedEV: space });
    await settle();
    await input('#ev-message', 'crie uma página HTML');
    await submit();
    assert.equal(document.querySelector('#ev-message').value, '');
    assert.equal(document.querySelector('.ev-chat').getAttribute('aria-busy'), 'true');
    await act(async () =>
      resolveReply({
        space,
        conversation: { id: chatId },
        messages: [{ id: 1, role: 'assistant', content: 'Resposta concluída' }],
        artifacts: [],
      }),
    );
    await settle();
    assert.match(document.body.textContent, /Resposta concluída/);
    assert.equal(document.querySelector('.ev-chat-working'), null);
    assert.equal(document.querySelector('#ev-message').disabled, false);
    await input('#ev-message', 'Minha próxima mensagem');
    await act(async () => rejectCleanup(Error('Falha local no rascunho')));
    await settle();
    assert.equal(document.querySelector('#ev-message').value, 'Minha próxima mensagem');
  } finally {
    await env.dispose();
  }
});

test('EV options confirm history clearing separately from EV deletion and protect fresh conversation revisions', async () => {
  for (const mode of ['clear', 'delete']) {
    const env = environment(),
      calls = [],
      changes = [];
    let closed = false;
    const space = {
      id: '11111111-1111-4111-8111-111111111111',
      chatId: '22222222-2222-4222-8222-222222222222',
      name: 'Meu EV',
      revision: 7,
      extensionId: 'cyro.logistics',
      extensionVersion: '1.0.0',
    };
    window.cyroEV = {
      request: async (c) => {
        calls.push(c);
        if (c.action === 'open') return { space };
        if (c.action === 'conversation.read') return { messages: [{ id: 18 }] };
        return { cleared: true, deleted: true };
      },
    };
    try {
      await env.mount(env.EVManage, {
        item: space,
        onClose: () => {
          closed = true;
        },
        onChanged: (x) => changes.push(x),
      });
      await settle();
      await click(
        [...document.querySelectorAll('button')].find(
          (b) => b.textContent === (mode === 'clear' ? 'Limpar mensagens' : 'Excluir EV'),
        ),
      );
      await settle();
      assert.equal(
        calls.some((c) => ['conversation.clear', 'delete'].includes(c.action)),
        false,
      );
      await click(
        [...document.querySelectorAll('button')].find(
          (b) => b.textContent === (mode === 'clear' ? 'Confirmar limpeza' : 'Confirmar exclusão'),
        ),
      );
      await settle();
      const command = calls.find(
        (c) => c.action === (mode === 'clear' ? 'conversation.clear' : 'delete'),
      );
      assert.equal(command.projectId, space.id);
      assert.equal(command.confirmation, mode === 'clear' ? 'LIMPAR' : 'EXCLUIR');
      if (mode === 'clear') {
        assert.equal(command.expectedLastMessageId, 18);
        assert.equal(command.id, space.chatId);
      } else assert.equal(command.expectedRevision, 7);
      assert.equal(closed, true);
      assert.equal(changes[0].action, mode);
    } finally {
      await env.dispose();
    }
  }
});

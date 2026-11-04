const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, input, click, act, settle } = require('../helpers/react.cjs');
const submit = async () => click('#ev-send');

test('EV operates only by messages; inline results, confirmation and retry preserve the same operation', async () => {
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
      calls.push(c);
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
    await env.mount(env.EVWorkspace, { hidden: false });
    assert.ok(document.querySelector('#ev-attach-files'));
    assert.ok(document.querySelector('#ev-microphone'));
    assert.ok(document.querySelector('#ev-send'));
    assert.equal(document.querySelector('.ev-tabs'), null);
    await input('#ev-message', 'crie um espaço chamado Minha transportadora');
    await submit();
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
      calls.push(c);
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
    await env.mount(env.EVWorkspace, { hidden: false });
    await input('#ev-message', 'crie um espaço chamado Fretes');
    await submit();
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
      calls.push(c);
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
    await env.mount(env.EVWorkspace, { hidden: false });
    await input('#ev-message', 'crie um espaço chamado Notas');
    await submit();
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
    assert.equal(calls.filter((c) => c.action === 'assistant.send').length, 1);
    await click('.ev-note-detail > button');
    assert.match(document.querySelector('#ev-attachment-list').textContent, /nota-teste.xml/);
    assert.equal(document.querySelector('#ev-message').value, '');
    assert.ok(calls.filter((c) => c.action === 'file.get').every((c) => c.projectId === projectId));
  } finally {
    await env.dispose();
  }
});

test('chat connection failure preserves the message and retries without a local-project fallback', async () => {
  const env = environment();
  let fail = true;
  window.cyroEV = {
    dirty: async () => {},
    request: async (c) =>
      c.action === 'files.list'
        ? { files: [], next: null }
        : fail
          ? { error: 'Espaços ainda não ativados.' }
          : { reply: 'Você ainda não criou espaços.' },
  };
  try {
    await env.mount(env.EVWorkspace, { hidden: false });
    await input('#ev-message', 'liste meus espaços');
    await submit();
    assert.match(document.querySelector('[role="alert"]').textContent, /não ativados/);
    assert.equal(document.querySelector('#ev-message').value, 'liste meus espaços');
    fail = false;
    await submit();
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.match(document.body.textContent, /não criou espaços/);
    assert.equal(document.querySelector('#add-project'), null);
  } finally {
    await env.dispose();
  }
});

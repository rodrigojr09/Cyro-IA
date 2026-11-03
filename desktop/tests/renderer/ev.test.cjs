const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, input, click, act, settle } = require('../helpers/react.cjs');
const submit = async () =>
  act(async () =>
    document
      .querySelector('.ev-chat-composer')
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
  );
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
    assert.equal(document.querySelectorAll('.ev-chat button').length, 1);
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
    assert.equal(document.querySelectorAll('.ev-chat button').length, 1);
    assert.ok(drafts.some((d) => d.operation === 'remove'));
    assert.equal(document.querySelector('#ev-message').value, '');
  } finally {
    await env.dispose();
  }
});
test('chat connection failure preserves the message and retries without a local-project fallback', async () => {
  const env = environment();
  let fail = true;
  window.cyroEV = {
    dirty: async () => {},
    request: async () =>
      fail ? { error: 'Espaços ainda não ativados.' } : { reply: 'Você ainda não criou espaços.' },
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

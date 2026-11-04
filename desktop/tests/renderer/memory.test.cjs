const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, input, click, act } = require('../helpers/react.cjs');
const pause = () => act(async () => new Promise((r) => setTimeout(r, 30)));
const button = (label) =>
  [
    ...document.querySelectorAll(
      '.memory-panel button, nav[aria-label="Escopo de memória"] button',
    ),
  ].find((b) => b.textContent === label);

test('memory settings use MAIN and EV API scopes, preserve revisions and recover after reopening', async () => {
  const env = environment(),
    calls = [];
  const projectId = '11111111-1111-4111-8111-111111111111';
  const main = [
      {
        id: 'main',
        content: 'Prefiro respostas curtas.',
        revision: 0,
        origin: { kind: 'USER_CHAT' },
        updatedAt: new Date().toISOString(),
      },
    ],
    ev = [],
    versions = [];
  window.cyroEV = {
    request: async (c) => {
      calls.push(c);
      assert.equal(
        c.scope === 'EV' ? c.projectId : undefined,
        c.scope === 'EV' ? projectId : undefined,
      );
      if (c.scope === 'MAIN') assert.equal(c.projectId, undefined);
      const items = c.scope === 'MAIN' ? main : ev;
      if (c.action === 'memory.list')
        return {
          store: { revision: 1, syncState: 'READY', summary: '# Memória' },
          items: items.map((i) => ({ ...i })),
          next: null,
        };
      if (c.action === 'memory.put') {
        items.push({
          id: 'ev-fact',
          content: c.content,
          revision: 0,
          origin: { kind: 'USER_API' },
          updatedAt: new Date().toISOString(),
        });
        return { persisted: true };
      }
      if (c.action === 'memory.correct') {
        const i = items.find((i) => i.id === c.id);
        assert.equal(i.revision, c.expectedRevision);
        versions.push({ ...i, changedAt: new Date().toISOString() });
        i.content = c.content;
        i.revision++;
        return { persisted: true };
      }
      if (c.action === 'memory.history')
        return { item: items.find((i) => i.id === c.id), history: versions, before: null };
      if (c.action === 'memory.forget') {
        const index = items.findIndex((i) => i.id === c.id);
        assert.equal(items[index].revision, c.expectedRevision);
        items.splice(index, 1);
        return { persisted: true };
      }
      throw Error('Unexpected action ' + c.action);
    },
  };
  try {
    await env.mount(env.MemoryPanel, { projectId });
    await pause();
    assert.match(document.querySelector('.memory-items').textContent, /respostas curtas/);
    await click(button('Espaço ativo'));
    await pause();
    assert.doesNotMatch(
      document.querySelector('.memory-panel').textContent,
      /Prefiro respostas curtas/,
    );
    await input('textarea[aria-label="Conteúdo da memória"]', 'Temos 12 caminhões.');
    await click(button('Salvar memória'));
    await pause();
    assert.match(document.querySelector('.memory-items').textContent, /12 caminhões/);
    await click(button('Corrigir'));
    await input('textarea[aria-label="Conteúdo da memória"]', 'Temos 15 caminhões.');
    await click(button('Salvar memória'));
    await pause();
    assert.match(document.querySelector('.memory-items').textContent, /15 caminhões/);
    await click(button('Origem e histórico'));
    assert.match(
      document.querySelector('[aria-label="Histórico da memória"]').textContent,
      /12 caminhões/,
    );
    await click(button('Esquecer'));
    await click(button('Confirmar exclusão'));
    await pause();
    assert.equal(ev.length, 0);
    assert.equal(main.length, 1);
    await env.mount(() => null);
    await env.mount(env.MemoryPanel, { projectId });
    await pause();
    assert.match(document.querySelector('.memory-items').textContent, /respostas curtas/);
    assert.ok(calls.some((c) => c.action === 'memory.correct' && c.expectedRevision === 0));
    assert.doesNotMatch(JSON.stringify(localStorage), /respostas curtas|caminhões/);
  } finally {
    await env.dispose();
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, input, click, act } = require('../helpers/react.cjs');
const pause = () => act(async () => new Promise(r => setTimeout(r, 35)));
const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label);
test('memory settings use natural messages, separate controls and confirmed scoped cleanup without a technical editor', async () => {
  const env = environment(), calls = [];
  const projectId = '11111111-1111-4111-8111-111111111111';
  const main = ['Prefiro respostas curtas.'], ev = ['Temos 12 caminhões.'];
  let settings = { automatic: true, useExisting: true }, proposal;
  window.cyroEV = { request: async c => {
    calls.push(c);
    if (c.action === 'memory.settings.get') return { settings: { ...settings } };
    if (c.action === 'memory.settings') { assert.deepEqual(c.expected, settings); settings = { automatic: c.automatic, useExisting: c.useExisting }; return { settings: { ...settings }, persisted: true }; }
    const items = c.scope === 'EV' ? ev : main;
    if (c.scope === 'EV') assert.equal(c.projectId, projectId); else assert.equal(c.projectId, undefined);
    if (c.action === 'memory.list') return { store: { summary: items.join(' '), syncState: 'READY' }, items: items.map((content, id) => ({ id: String(id), content, origin: { kind: 'USER_CHAT' }, updatedAt: new Date().toISOString() })) };
    if (c.action === 'memory.message') { proposal = { id: 'proposal', action: 'CLEAR', target: c.scope }; return { reply: 'Confirme para limpar esta memória sem excluir conversas.', proposal }; }
    if (c.action === 'memory.confirm') { assert.equal(c.proposalId, proposal.id); if (c.decision === 'APPLY') items.splice(0); return { reply: c.decision === 'APPLY' ? 'Memória ativa limpa.' : 'Pedido cancelado.', persisted: c.decision === 'APPLY' }; }
    throw Error('Unexpected action ' + c.action);
  } };
  try {
    await env.mount(env.MemoryPanel, { projectId }); await pause();
    assert.match(document.querySelector('.memory-summary').textContent, /respostas curtas/);
    assert.equal(document.querySelectorAll('textarea').length, 1);
    assert.match(document.querySelector('textarea').placeholder, /lembre ou esqueça/);
    const toggles = document.querySelectorAll('input[type=checkbox]');
    await click(toggles[0]); await pause();
    assert.equal(settings.automatic, false); assert.equal(settings.useExisting, true); assert.equal(main.length, 1);
    await click(button('Espaço ativo')); await pause();
    assert.match(document.querySelector('.memory-summary').textContent, /12 caminhões/);
    await input('textarea', 'Limpe toda a memória deste EV.'); await click(button('Enviar')); await pause();
    assert.equal(ev.length, 1); assert.ok(button('Confirmar alteração'));
    await click(button('Cancelar')); await pause(); assert.equal(ev.length, 1);
    await click(button('Limpar memória deste EV')); await pause(); await click(button('Confirmar alteração')); await pause();
    assert.equal(ev.length, 0); assert.equal(main.length, 1);
    assert.match(document.querySelector('[role=log]').textContent, /Memória ativa limpa/);
    await env.mount(() => null); await env.mount(env.MemoryPanel, { projectId }); await pause();
    assert.match(document.querySelector('.memory-summary').textContent, /respostas curtas/);
    assert.equal(document.querySelector('input[type=checkbox]').checked, false);
    assert.ok(calls.some(c => c.action === 'memory.message' && c.scope === 'EV'));
    assert.ok(calls.some(c => c.action === 'memory.confirm' && c.decision === 'APPLY'));
    assert.doesNotMatch(JSON.stringify(localStorage), /respostas curtas|caminhões/);
  } finally { await env.dispose(); }
});

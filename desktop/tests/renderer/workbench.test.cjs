const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment, input, click, settle } = require('../helpers/react.cjs');
test('IDE saves scoped files and tables and only executes a queued request through native bridge', async () => {
  const env = environment(),
    calls = [];
  let state = { revision: 0, files: [], tables: [], executions: [] },
    executed;
  window.cyroEV = {
    execute: async (value) => {
      executed = value;
      return { output: '42', exitCode: 0 };
    },
  };
  const request = async (c) => {
    calls.push(c);
    if (c.action === 'workbench.write')
      state = { ...state, revision: 1, files: [{ name: c.name, content: c.content }] };
    if (c.action === 'workbench.table')
      state = {
        ...state,
        revision: 2,
        tables: [{ name: c.name, columns: c.columns, rows: c.rows }],
      };
    if (c.action === 'workbench.execute')
      state = {
        ...state,
        revision: 3,
        executions: [
          {
            id: 'queued',
            source: c.source,
            runtime: c.runtime,
            files: state.files,
            createdAt: '2026-11-19T00:00:00Z',
          },
        ],
      };
    return state;
  };
  try {
    await env.mount(env.EVWorkbench, {
      projectId: 'space',
      open: true,
      onClose: () => {},
      request,
    });
    await settle();
    await input('textarea[aria-label="Editor de código"]', 'print(42)');
    const button = (text) =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === text);
    await click(button('Salvar no EV'));
    await settle();
    assert.equal(calls.at(-1).action, 'workbench.write');
    assert.equal(calls.at(-1).projectId, 'space');
    assert.equal(calls.at(-1).expectedRevision, 0);
    await click(button('Tabelas'));
    await click(button('Salvar tabela'));
    await settle();
    assert.equal(calls.at(-1).action, 'workbench.table');
    assert.deepEqual(calls.at(-1).rows, [['Exemplo', 10]]);
    await click(button('Execução'));
    await click(button('Solicitar execução'));
    await settle();
    assert.equal(executed, undefined);
    await click(button('Revisar e executar'));
    await settle();
    assert.deepEqual(executed, { projectId: 'space', requestId: 'queued' });
    assert.match(document.querySelector('[role="log"]').textContent, /42/);
  } finally {
    await env.dispose();
  }
});

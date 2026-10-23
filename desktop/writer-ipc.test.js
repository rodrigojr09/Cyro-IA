const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { install } = require('./writer-ipc');
test('Writer IPC limita origem, tamanho e ações; só exporta para destino escolhido', async () => {
  const handlers = {},
    calls = [],
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'writer-ipc-'));
  const event = {},
    project_id = randomUUID();
  let canceled = true;
  const service = install({
    ipcMain: { handle: (name, fn) => (handlers[name] = fn) },
    trusted: (e) => e === event,
    mainWindow: () => null,
    backend: async (...args) => {
      calls.push(args);
      return {
        ok: true,
        data: {
          name: 'Teste.docx',
          format: 'docx',
          base64: Buffer.from('DOCX fixture').toString('base64'),
        },
      };
    },
    dialog: {
      showSaveDialog: async () => ({ canceled, filePath: path.join(folder, 'Teste.docx') }),
    },
  });
  try {
    await assert.rejects(
      handlers['writer:command']({}, { project_id, action: 'open' }),
      /não autorizada/,
    );
    await assert.rejects(
      handlers['writer:command'](event, { project_id, action: 'execute' }),
      /inválida/,
    );
    await assert.rejects(
      handlers['writer:command'](event, {
        project_id,
        action: 'save',
        payload: { text: 'x'.repeat(1024 * 1024) },
      }),
      /limite/,
    );
    await handlers['writer:command'](event, { project_id, action: 'open', payload: {} });
    assert.equal(calls.at(-1)[0], '/writer');
    handlers['writer:dirty'](event, true);
    assert.equal(service.isDirty(), true);
    assert.throws(() => handlers['writer:dirty']({}, false));
    assert.equal(
      (await handlers['writer:export'](event, { project_id, format: 'docx', document_ids: [] }))
        .saved,
      false,
    );
    canceled = false;
    assert.equal(
      (await handlers['writer:export'](event, { project_id, format: 'docx', document_ids: [] }))
        .saved,
      true,
    );
    assert.equal(await fs.readFile(path.join(folder, 'Teste.docx'), 'utf8'), 'DOCX fixture');
    await fs.link(path.join(folder, 'Teste.docx'), path.join(folder, 'shared.docx'));
    await assert.rejects(
      handlers['writer:export'](event, { project_id, format: 'docx', document_ids: [] }),
      /compartilhado/,
    );
  } finally {
    assert.equal(path.dirname(path.resolve(folder)), path.resolve(os.tmpdir()));
    await fs.rm(folder, { recursive: true, force: true });
  }
});

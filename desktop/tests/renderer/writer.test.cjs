const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, deferred } = require('../helpers/react.cjs');
const { fixture } = require('../helpers/fixture.cjs');
async function setup(options = {}) {
  const env = environment(),
    f = fixture(env, options),
    writer = env.createWriter();
  const chat = { id: 'writer-chat', writer_document_id: f.document.id, project_id: f.project.id };
  await writer.load(f.project, chat);
  return {
    env,
    f,
    writer,
    async close() {
      writer.dispose();
      await env.dispose();
    },
  };
}
test('Writer mounts structured blocks and reads metadata through narrow IPC', async () => {
  const t = await setup();
  try {
    assert.equal(t.writer.get().document.blocks[0].text, 'Texto inicial');
    assert.equal(t.writer.get().document.title, 'Documento.docx');
    assert.ok(t.f.calls.some((row) => row.writer?.action === 'messages'));
    assert.ok(!t.f.calls.some((row) => row.route === '/chat'));
  } finally {
    await t.close();
  }
});
test('manual edits coalesce and save without using AI', async () => {
  const t = await setup();
  try {
    await t.writer.toggleEdit();
    t.writer.edit([{ id: 'block-a', type: 'paragraph', text: 'Edit 1' }]);
    t.writer.edit([{ id: 'block-a', type: 'paragraph', text: 'Edit 2' }]);
    await t.writer.flush();
    const saves = t.f.calls.filter((row) => row.writer?.action === 'save');
    assert.equal(saves.length, 1);
    assert.equal(saves[0].writer.payload.blocks[0].text, 'Edit 2');
    assert.equal(t.writer.get().dirty, false);
    assert.ok(!t.f.calls.some((row) => row.writer?.action === 'assist'));
  } finally {
    await t.close();
  }
});
test('manual save failure retains the exact edit and blocks navigation', async () => {
  const t = await setup();
  const original = window.jarvisWriter.command;
  try {
    window.jarvisWriter.command = async (value) =>
      value.action === 'save' ? { ok: false, data: { detail: 'Conflict' } } : original(value);
    await t.writer.toggleEdit();
    t.writer.edit([{ id: 'block-a', type: 'paragraph', text: 'RECOVERABLE TEXT' }]);
    await assert.rejects(t.writer.leave(), /Conflict/);
    assert.equal(t.writer.get().document.blocks[0].text, 'RECOVERABLE TEXT');
    assert.equal(t.writer.get().dirty, true);
    assert.match(t.writer.get().error, /recuperação/);
  } finally {
    await t.close();
  }
});
test('a save in flight never overwrites a newer acknowledged edit', async () => {
  const t = await setup(),
    pending = deferred(),
    original = window.jarvisWriter.command;
  let writes = 0;
  try {
    window.jarvisWriter.command = async (value) => {
      if (value.action === 'save' && ++writes === 1) return pending.promise;
      return original(value);
    };
    await t.writer.toggleEdit();
    t.writer.edit([{ id: 'block-a', type: 'paragraph', text: 'First' }]);
    const saving = t.writer.flush();
    await new Promise((resolve) => setImmediate(resolve));
    t.writer.edit([{ id: 'block-a', type: 'paragraph', text: 'Second' }]);
    pending.resolve({ ok: true, data: { version: 2 } });
    await saving;
    assert.equal(t.writer.get().document.blocks[0].text, 'Second');
    assert.equal(t.writer.get().dirty, false);
    assert.equal(writes, 2);
  } finally {
    await t.close();
  }
});
test('Writer flushes manual changes before requesting a proposal', async () => {
  const t = await setup();
  try {
    await t.writer.toggleEdit();
    t.writer.edit([{ id: 'block-a', type: 'paragraph', text: 'Manual' }]);
    await t.writer.send('Improve this');
    const actions = t.f.calls.filter((row) => row.writer).map((row) => row.writer.action);
    assert.ok(actions.indexOf('save') < actions.indexOf('assist'));
    const payload = t.f.calls.find((row) => row.writer?.action === 'assist').writer.payload;
    assert.equal(payload.chat_id, 'writer-chat');
    assert.equal(payload.base_version, 2);
    assert.equal(payload.intent_override, null);
  } finally {
    await t.close();
  }
});
test('pending proposals never alter a document before a decision', async () => {
  const t = await setup(),
    original = window.jarvisWriter.command;
  try {
    window.jarvisWriter.command = async (value) =>
      value.action === 'assist'
        ? {
            ok: true,
            data: {
              reply: 'Review',
              proposal: {
                id: 'proposal-a',
                state: 'PENDING',
                plan: {
                  operation: 'replace',
                  targetDocumentId: t.f.document.id,
                  blocks: [{ type: 'paragraph', text: 'Proposed' }],
                },
                auto: false,
              },
            },
          }
        : original(value);
    await t.writer.send('Improve');
    assert.equal(t.writer.get().document.blocks[0].text, 'Texto inicial');
    assert.equal(t.writer.get().proposal.state, 'PENDING');
    assert.equal(t.writer.get().dirty, true);
    assert.ok(!t.f.calls.some((row) => row.writer?.action === 'decide'));
  } finally {
    await t.close();
  }
});
test('a conflicted prior proposal prevents sending the next message', async () => {
  const t = await setup(),
    original = window.jarvisWriter.command;
  try {
    t.writer.set({ proposal: { id: 'proposal-a', state: 'PENDING' } });
    window.jarvisWriter.command = async (value) =>
      value.action === 'decide'
        ? { ok: true, data: { state: 'CONFLICTED', message: 'Changed externally' } }
        : original(value);
    await assert.rejects(t.writer.send('Next question'), /conflito/);
    assert.ok(!t.f.calls.some((row) => row.writer?.action === 'assist'));
    assert.equal(t.writer.get().proposal.state, 'CONFLICTED');
  } finally {
    await t.close();
  }
});
test('selected block IDs and text remain separate from the message', async () => {
  const t = await setup();
  try {
    t.writer.select(['block-a'], 'Selected excerpt');
    await t.writer.send('Explain selection');
    const payload = t.f.calls.find((row) => row.writer?.action === 'assist').writer.payload;
    assert.deepEqual(payload.selected_block_ids, ['block-a']);
    assert.equal(payload.selected_text, 'Selected excerpt');
    assert.equal(payload.message, 'Explain selection');
  } finally {
    await t.close();
  }
});

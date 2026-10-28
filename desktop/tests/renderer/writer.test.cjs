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
test('a pending proposal requires an explicit decision before the next model call', async () => {
  const t = await setup(),
    original = window.jarvisWriter.command;
  try {
    t.writer.set({ proposal: { id: 'proposal-a', state: 'PENDING' } });
    window.jarvisWriter.command = async (value) =>
      value.action === 'decide'
        ? { ok: true, data: { state: 'CONFLICTED', message: 'Changed externally' } }
        : original(value);
    await assert.rejects(t.writer.send('Next question'), /proposta pendente/);
    assert.ok(!t.f.calls.some((row) => row.writer?.action === 'assist'));
    assert.equal(t.writer.get().proposal.state, 'PENDING');
    assert.ok(!t.f.calls.some((row) => row.writer?.action === 'decide'));
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

test('autosave waits for idle and retains an idempotent request after lost acknowledgement', async () => {
  const t = await setup(),
    original = window.jarvisWriter.command;
  let first = true;
  const ids = [];
  try {
    window.jarvisWriter.command = async (value) => {
      if (value.action === 'save') {
        ids.push(value.payload.request_id);
        if (first) {
          first = false;
          throw Error('Connection lost');
        }
      }
      return original(value);
    };
    for (let i = 0; i < 30; i++)
      t.writer.edit([{ id: 'a', type: 'paragraph', text: 'Typing ' + i }]);
    assert.equal(ids.length, 0);
    await assert.rejects(t.writer.flush(), /Connection lost/);
    t.writer.edit([{ id: 'a', type: 'paragraph', text: 'New draft' }]);
    await t.writer.flush();
    assert.equal(ids[0], ids[1]);
    assert.equal(t.writer.get().document.blocks[0].text, 'New draft');
    assert.equal(t.writer.get().dirty, false);
  } finally {
    await t.close();
  }
});

test('actual idle autosave coalesces keystrokes and makes no model call', async () => {
  const t = await setup();
  try {
    for (let i = 0; i < 40; i++)
      t.writer.edit([{ id: 'a', type: 'paragraph', text: 'Keystroke ' + i }]);
    await new Promise((resolve) => setTimeout(resolve, 1750));
    assert.equal(t.f.calls.filter((c) => c.writer?.action === 'save').length, 1);
    assert.equal(t.f.calls.filter((c) => c.writer?.action === 'assist').length, 0);
    assert.equal(t.writer.get().unsynced, false);
  } finally {
    await t.close();
  }
});
test('unsynced draft is recovered after editor disposal without overwriting a changed server revision', async () => {
  const t = await setup();
  let restored;
  try {
    t.writer.edit([{ id: 'a', type: 'paragraph', text: 'Offline draft' }]);
    t.writer.dispose();
    t.f.document.version = 9;
    restored = t.env.createWriter();
    await restored.load(t.f.project, { id: 'writer-chat', writer_document_id: t.f.document.id });
    assert.equal(restored.get().document.blocks[0].text, 'Offline draft');
    assert.equal(restored.get().unsynced, true);
    assert.match(restored.get().error, /versão salva mudou/);
    assert.equal(t.f.calls.filter((c) => c.writer?.action === 'save').length, 0);
  } finally {
    restored?.dispose();
    await t.close();
  }
});

test('failed reload retains the recoverable unsynced draft', async () => {
  const t = await setup(),
    original = window.jarvisWriter.command;
  try {
    t.writer.edit([{ id: 'a', type: 'paragraph', text: 'Keep after failure' }]);
    t.writer.preserve();
    window.jarvisWriter.command = async (value) =>
      value.action === 'get' ? { ok: false, data: { detail: 'Offline' } } : original(value);
    await assert.rejects(t.writer.reload(), /Offline/);
    assert.equal(t.writer.get().document.blocks[0].text, 'Keep after failure');
    assert.equal(t.writer.get().unsynced, true);
    assert.ok(
      localStorage.getItem('cyro.writer.recovery.' + t.f.project.id + '.' + t.f.document.id),
    );
  } finally {
    await t.close();
  }
});

test('switching the loaded document invalidates the previous selection range', async () => {
  const t = await setup();
  try {
    t.writer.select(['block-a'], 'Old selection', {
      block_id: 'block-a',
      start: 0,
      end: 3,
      text: 'Old',
    });
    await t.writer.load(t.f.project, { id: 'writer-chat', writer_document_id: t.f.document.id });
    await t.writer.send('Explain document');
    const payload = t.f.calls.filter((c) => c.writer?.action === 'assist').at(-1).writer.payload;
    assert.equal(payload.selection, null);
    assert.deepEqual(payload.selected_block_ids, []);
  } finally {
    await t.close();
  }
});

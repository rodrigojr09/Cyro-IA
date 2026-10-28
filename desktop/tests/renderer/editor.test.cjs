const test = require('node:test'),
  assert = require('node:assert/strict');
const { environment } = require('../helpers/react.cjs');
const { fixture } = require('../helpers/fixture.cjs');
async function setup(blocks) {
  const env = environment(),
    f = fixture(env),
    writer = env.createWriter();
  await writer.load(f.project, {
    id: 'writer-chat',
    writer_document_id: f.document.id,
    project_id: f.project.id,
  });
  let binding;
  const editor = new env.Editor({
    element: document.createElement('div'),
    extensions: env.extensions(),
    content: env.toDocument(blocks || f.document.blocks),
    editorProps: { handleScrollToSelection: () => true },
    onUpdate: ({ editor }) => {
      if (!binding?.adapter.remote) writer.edit(env.editorBlocks(editor));
    },
  });
  document.body.append(editor.options.element);
  binding = env.connectEditor(editor, writer);
  return {
    env,
    f,
    writer,
    editor,
    binding,
    async close() {
      binding.dispose();
      editor.destroy();
      writer.dispose();
      await env.dispose();
    },
  };
}
const block = (id, text) => ({ id, type: 'paragraph', text });
test('single ProseMirror document edits paragraphs, formats and preserves legacy order', async () => {
  const input = [
      block('a', 'First'),
      { id: 'b', type: 'heading1', text: 'Title' },
      { id: 'c', type: 'bullet', text: 'Item' },
    ],
    before = structuredClone(input),
    t = await setup(input);
  try {
    assert.equal(t.editor.state.doc.childCount, 3);
    assert.deepEqual(input, before);
    t.editor.commands.insertContentAt(6, ' added');
    t.editor.commands.setTextSelection({ from: 1, to: 6 });
    t.editor.commands.toggleBold();
    t.editor.commands.toggleItalic();
    t.editor.commands.toggleUnderline();
    t.editor.commands.setTextAlign('center');
    const data = t.env.editorBlocks(t.editor);
    assert.equal(data[0].text, 'First added');
    assert.equal(data[0].rich.attrs.textAlign, 'center');
    assert.deepEqual(data[0].rich.content[0].marks.map((m) => m.type).sort(), [
      'bold',
      'italic',
      'underline',
    ]);
    assert.equal(document.querySelectorAll('textarea').length, 0);
    t.editor.commands.splitBlock();
    assert.ok(t.editor.state.doc.childCount >= 4);
    await t.writer.flush();
    assert.equal(t.f.calls.filter((c) => c.writer?.action === 'save').length, 1);
  } finally {
    await t.close();
  }
});
test('targeted AI operation, specific undo and redo preserve later manual edits elsewhere', async () => {
  const t = await setup([block('a', 'First'), block('b', 'Second')]);
  try {
    t.binding.adapter.apply([block('a', 'AI first'), block('b', 'Second')], 'ai');
    t.editor.commands.insertContentAt(t.editor.state.doc.content.size - 1, ' manually');
    const reply = t.binding.adapter.control('undo', true);
    assert.match(reply, /preservadas/);
    assert.match(t.editor.getText(), /First/);
    assert.match(t.editor.getText(), /Second manually/);
    assert.match(t.binding.adapter.control('redo'), /refeita/);
    assert.match(t.editor.getText(), /AI first/);
    assert.match(t.editor.getText(), /manually/);
    assert.match(t.binding.adapter.control('undo', true), /preservadas/);
    assert.match(t.editor.getText(), /First/);
  } finally {
    await t.close();
  }
});
test('specific AI undo refuses to erase manual edits inside its changed region', async () => {
  const t = await setup([block('a', 'First'), block('b', 'Second')]);
  try {
    t.binding.adapter.apply([block('a', 'AI first'), block('b', 'Second')], 'ai');
    t.editor.commands.insertContentAt(2, 'manual');
    const before = t.editor.getJSON();
    assert.match(t.binding.adapter.control('undo', true), /manuais/);
    assert.deepEqual(t.editor.getJSON(), before);
  } finally {
    await t.close();
  }
});
test('ordinary undo/redo uses editor operations without deleting chat messages or model calls', async () => {
  const t = await setup();
  try {
    t.editor.commands.insertContentAt(2, 'hello');
    const before = t.editor.getText();
    await t.writer.send('Desfazer');
    assert.notEqual(t.editor.getText(), before);
    await t.writer.send('Refazer');
    assert.equal(t.editor.getText(), before);
    assert.equal(t.writer.get().messages.filter((m) => m.role === 'user').length, 2);
    assert.equal(t.f.calls.filter((c) => c.writer?.action === 'assist').length, 0);
  } finally {
    await t.close();
  }
});
test('long document stays one editor; stable save acknowledgement leaves cursor unchanged', async () => {
  const t = await setup(
    Array.from({ length: 300 }, (_, i) => block('node-' + i, 'Paragraph ' + i)),
  );
  try {
    const editor = t.editor;
    t.editor.commands.setTextSelection(10);
    t.editor.commands.insertContent('x');
    const selection = t.editor.state.selection.from;
    await t.writer.flush();
    t.binding.adapter.apply(t.writer.get().document.blocks);
    assert.equal(t.editor, editor);
    assert.equal(t.editor.state.selection.from, selection);
    assert.equal(t.editor.state.doc.childCount, 300);
  } finally {
    await t.close();
  }
});

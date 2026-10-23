const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createAttachments, MAX_BYTES } = require('./attachments-main');

test('seleção nativa avisa antes de importar excesso de quantidade ou tamanho', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-attachments-'));
  const file = path.join(directory, 'note.txt');
  fs.writeFileSync(file, 'hello');
  let selection = Array(6).fill(file),
    calls = [];
  const service = createAttachments({
    dialog: { showOpenDialog: async () => ({ filePaths: selection }) },
    window: () => ({}),
    backend: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  });
  try {
    await assert.rejects(service.choose(5), /5 arquivos/);
    assert.equal(calls.length, 0);
    selection = [file];
    fs.truncateSync(file, MAX_BYTES + 1);
    await assert.rejects(service.choose(5), /5 MB/);
    assert.equal(calls.length, 0);
    fs.truncateSync(file, MAX_BYTES);
    await service.choose(5);
    assert.equal(calls[0][0], '/desktop/attachments/import');
    assert.equal(JSON.parse(calls[0][2]).paths[0], file);
    await assert.rejects(service.info('../private'), /Anexo inválido/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function setup(response) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), {
    runScripts: 'outside-only',
  });
  const discarded = [];
  dom.window.jarvisWindow = {
    chooseAttachments: async () => response,
    discardAttachment: async (id) => {
      discarded.push(id);
      return { ok: true };
    },
    saveAttachment: async () => ({ canceled: true }),
  };
  dom.window.eval(fs.readFileSync(path.join(__dirname, 'attachments-ui.js'), 'utf8'));
  return { window: dom.window, document: dom.window.document, dom, discarded };
}

test('interface mantém no máximo cinco anexos e mostra o texto exato quando o arquivo está em outro computador', async () => {
  const files = Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    name: 'note-' + i + '.txt',
    size: 1024,
    kind: 'document',
  }));
  const f = setup({ ok: true, data: { files } });
  try {
    await f.document.getElementById('attach-files').onclick();
    assert.equal(f.window.jarvisAttachments.ids().length, 5);
    assert.equal(f.document.getElementById('attach-files').disabled, true);
    f.window.jarvisAttachments.busy(true);
    assert.equal(f.document.querySelector('.attachment-card button').disabled, true);
    f.window.jarvisAttachments.busy(false);
    const message = f.document.createElement('div');
    f.window.jarvisAttachments.renderHistory(message, undefined, true);
    assert.equal(message.textContent, 'Salvo localmente em outro Computador');
    f.window.jarvisAttachments.clear();
    assert.equal(f.window.jarvisAttachments.ids().length, 0);
    assert.equal(f.discarded.length, 5);
  } finally {
    f.dom.window.close();
  }
});

test('validação visual rejeita seis arquivos ou um arquivo acima de 5 MB', async () => {
  for (const files of [
    Array.from({ length: 6 }, () => ({ id: 'x', size: 1 })),
    [{ id: 'x', size: MAX_BYTES + 1 }],
  ]) {
    const f = setup({ ok: true, data: { files } });
    try {
      await f.document.getElementById('attach-files').onclick();
      assert.match(f.document.getElementById('attachment-error').textContent, /5 arquivos/);
      assert.equal(f.window.jarvisAttachments.ids().length, 0);
    } finally {
      f.dom.window.close();
    }
  }
});

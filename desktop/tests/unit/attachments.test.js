const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAttachments, MAX_BYTES } = require('../../scripts/attachment/main');

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
  const dom = new JSDOM(fs.readFileSync(path.join(DESKTOP_ROOT, 'index.html'), 'utf8'), {
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
  dom.window.eval(fs.readFileSync(path.join(DESKTOP_ROOT, 'scripts/attachment/ui.js'), 'utf8'));
  return { window: dom.window, document: dom.window.document, dom, discarded };
}

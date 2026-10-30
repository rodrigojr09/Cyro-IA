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

test('explicit image paste validates MIME, bounded base64 and never accepts paths or URLs', async () => {
  const calls = [];
  const service = createAttachments({
    backend: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  });
  await service.pasteImage({ type: 'image/png', data: 'AQID' });
  assert.equal(calls[0][0], '/desktop/attachments/paste-image');
  assert.deepEqual(JSON.parse(calls[0][2]), { data: 'AQID' });
  for (const value of [
    { type: 'image/svg+xml', data: 'AQID' },
    { type: 'image/png', data: 'https://example.com/image.png' },
    { type: 'image/png', data: 'AQID', path: 'C:/private' },
    { type: 'image/png', data: Buffer.alloc(MAX_BYTES + 1).toString('base64') },
  ])
    await assert.rejects(service.pasteImage(value));
  assert.equal(calls.length, 1);
});

test('dropped file imports only bounded bytes and a plain supported name, never a path', async () => {
  const calls = [];
  const service = createAttachments({
    backend: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  });
  await service.dropFile({
    name: 'relatório.txt',
    data: Buffer.from('Conteúdo').toString('base64'),
  });
  assert.equal(calls[0][0], '/desktop/attachments/import-data');
  for (const value of [
    { name: '../secret.txt', data: 'AQID' },
    { name: 'C:secret.txt', data: 'AQID' },
    { name: 'arquivo.exe', data: 'AQID' },
    { name: 'x.png', data: 'https://example.test/x' },
    { name: 'x.txt', data: 'AQID', path: 'C:/private.txt' },
    { name: 'x.txt', data: Buffer.alloc(MAX_BYTES + 1).toString('base64') },
  ])
    await assert.rejects(service.dropFile(value));
  assert.equal(calls.length, 1);
});

test('automatic download reserves a unique Downloads file without dialog or overwriting existing data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyro-download-'));
  const existing = path.join(directory, 'imagem.png');
  fs.writeFileSync(existing, 'preservar');
  let exported;
  const service = createAttachments({
    downloads: () => directory,
    backend: async (route, method, payload) => {
      if (route.endsWith('/info')) return { ok: true, data: { name: 'imagem.png' } };
      exported = JSON.parse(payload);
      assert.equal(fs.readFileSync(exported.path).length, 0);
      fs.writeFileSync(exported.path, 'imagem');
      return { ok: true };
    },
  });
  try {
    await service.download('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    assert.equal(path.dirname(exported.path), fs.realpathSync(directory));
    assert.notEqual(exported.path, existing);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'preservar');
    assert.equal(fs.readFileSync(exported.path, 'utf8'), 'imagem');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('automatic download failure removes its reserved file and preserves other downloads', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyro-download-fail-'));
  const service = createAttachments({
    downloads: () => directory,
    backend: async (route) =>
      route.endsWith('/info')
        ? { ok: true, data: { name: 'imagem.png' } }
        : { ok: false, data: { detail: 'Offline' } },
  });
  try {
    const result = await service.download('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    assert.equal(result.ok, false);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

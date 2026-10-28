const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { configPath, prepareConfig } = require('../../scripts/session/ai-config');

async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-config-'));
  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
test('configuração portátil usa dados privados e desenvolvimento usa backend', () => {
  const options = {
    dataDir: path.resolve('fixture/private'),
    sourceDir: path.resolve('fixture/desktop'),
  };
  assert.equal(configPath({ ...options, packaged: true }), path.join(options.dataDir, '.env'));
  assert.equal(configPath({ ...options, packaged: false }), path.resolve('fixture/backend/.env'));
});
test('primeiro acesso cria somente template vazio sem segredo', () =>
  fixture(async (root) => {
    const file = await prepareConfig({ packaged: true, dataDir: root });
    assert.match(await fs.readFile(file, 'utf8'), /OPENAI_API_KEY=\n$/);
    assert.deepEqual(await fs.readdir(root), ['.env']);
  }));
test('abrir configuração preserva conteúdo existente sem devolvê-lo', () =>
  fixture(async (root) => {
    const file = path.join(root, '.env');
    const content = 'OPENAI_API_KEY=fake-private-fixture\n';
    await fs.writeFile(file, content);
    assert.equal(await prepareConfig({ packaged: true, dataDir: root }), file);
    assert.equal(await fs.readFile(file, 'utf8'), content);
  }));
test('configuração recusa hard link e mantém arquivo original', () =>
  fixture(async (root) => {
    const source = path.join(root, 'original');
    await fs.writeFile(source, 'fake fixture');
    await fs.link(source, path.join(root, '.env'));
    await assert.rejects(prepareConfig({ packaged: true, dataDir: root }), /compartilhado/);
    assert.equal(await fs.readFile(source, 'utf8'), 'fake fixture');
  }));

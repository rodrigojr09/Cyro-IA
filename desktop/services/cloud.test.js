const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, readFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { parseActivation, cloudOrigin, createCloud } = require('./cloud');
const code = 'a'.repeat(43);
test('protocolo aceita somente ativação com um único token válido', () => {
  assert.equal(parseActivation(`jarvis://activate?token=${code}`), code);
  for (const value of [
    `https://activate?token=${code}`,
    `jarvis://activate?token=${code}&token=${code}`,
    `jarvis://activate/other?token=${code}`,
    `jarvis://user@activate?token=${code}`,
    `jarvis://activate?token=${code}#frag`,
    `jarvis://activate?token=${code}&next=x`,
    'jarvis://activate?token=short',
  ])
    assert.throws(() => parseActivation(value));
});
test('origem exige HTTPS em distribuição e não aceita credenciais/caminho', () => {
  assert.equal(cloudOrigin('https://jarvis.example.test'), 'https://jarvis.example.test');
  assert.equal(cloudOrigin('http://localhost:3000', false), 'http://localhost:3000');
  for (const url of [
    'http://localhost:3000',
    'https://user:password@example.test',
    'https://example.test/path',
    'https://example.test/?token=x',
  ])
    assert.throws(() => cloudOrigin(url));
});
test('credencial individual usa armazenamento protegido e não persiste código temporário', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-cloud-test-'));
  try {
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from('protected:' + Buffer.from(value).toString('base64')),
      decryptString: (value) => Buffer.from(value.toString().slice(10), 'base64').toString(),
    };
    let calls = 0;
    const service = createCloud({
      safeStorage,
      dataDir: directory,
      origin: 'https://jarvis.example.test',
      fetcher: async (_url, options) => {
        calls++;
        assert.equal(JSON.parse(options.body).token, code);
        return {
          ok: true,
          json: async () => ({ credential: 'b'.repeat(43), expiresAt: '2030-01-01' }),
        };
      },
    });
    assert.equal(await service.load(), null);
    await service.activate(`jarvis://activate?token=${code}`, 'Teste');
    const persisted = await readFile(path.join(directory, 'cloud-credential.bin'), 'utf8');
    assert.ok(!persisted.includes(code));
    assert.ok(!persisted.includes('b'.repeat(43)));
    await assert.rejects(service.activate(`jarvis://activate?token=${code}`, 'Teste'));
    assert.equal(calls, 1);
    const restored = createCloud({
      safeStorage,
      dataDir: directory,
      origin: 'https://jarvis.example.test',
    });
    assert.equal((await restored.load()).credential, 'b'.repeat(43));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, readFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { cloudOrigin, createCloud } = require('./cloud');
const code = 'a'.repeat(43);
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
test('sessão de login usa armazenamento protegido e nunca persiste a senha', async () => {
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
        assert.equal(JSON.parse(options.body).password, 'password-for-test-only');
        return {
          ok: true,
          json: async () => ({ credential: 'b'.repeat(43), expiresAt: '2030-01-01' }),
        };
      },
    });
    assert.equal(await service.load(), null);
    await service.login(
      { email: 'user@example.test', password: 'password-for-test-only' },
      'Teste',
    );
    const persisted = await readFile(path.join(directory, 'cloud-session-v4.bin'), 'utf8');
    assert.ok(!persisted.includes('password-for-test-only'));
    assert.ok(!persisted.includes('b'.repeat(43)));
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

test('sessão revogada é apagada; falha de conexão bloqueia sem perder login salvo', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-session-test-'));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (v) => Buffer.from(v),
    decryptString: (v) => v.toString(),
  };
  let status = 200;
  const service = createCloud({
    safeStorage,
    dataDir: directory,
    origin: 'https://jarvis.example.test',
    fetcher: async (url) => {
      if (url.endsWith('/login'))
        return { ok: true, json: async () => ({ credential: code, expiresAt: '2030-01-01' }) };
      if (status === 0) throw Error('offline');
      return { ok: status === 200, status, json: async () => ({ active: true }) };
    },
  });
  try {
    await service.login(
      { email: 'user@example.test', password: 'password-for-test-only' },
      'Teste',
    );
    status = 0;
    await assert.rejects(service.refresh());
    assert.equal(service.state().status, 'offline');
    assert.ok(service.current());
    status = 200;
    await service.refresh();
    assert.equal(service.state().status, 'active');
    status = 401;
    await assert.rejects(service.refresh());
    assert.equal(service.state().status, 'revoked');
    assert.equal(service.current(), null);
    await assert.rejects(readFile(path.join(directory, 'cloud-session-v4.bin')));
    await service.login(
      { email: 'user@example.test', password: 'password-for-test-only' },
      'Teste',
    );
    status = 200;
    await service.logout();
    assert.equal(service.current(), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Spotify 403 não encerra sessão JARVIS nem expõe credencial', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-spotify-session-'));
  const service = createCloud({
    dataDir: directory,
    origin: 'https://jarvis.example.test',
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from(v) },
    fetcher: async (url, options) =>
      url.endsWith('/login')
        ? Response.json({ credential: code, expiresAt: '2030-01-01' })
        : Response.json({ error: 'Premium necessário' }, { status: 403 }),
  });
  try {
    await service.login({ email: 'test@example.test', password: 'test-fixture' }, 'Teste');
    await assert.rejects(
      service.request('/api/integrations/spotify', 'POST', {
        operation: 'control',
        command: { action: 'pause' },
      }),
      /Premium/,
    );
    assert.equal(service.current().credential, code);
    assert.equal(service.state().status, 'active');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

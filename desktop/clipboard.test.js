const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./clipboard-manager');
function fixture(config = {}) {
  let text = 'Conteúdo inicial existente',
    formats = ['text/plain'],
    clock = 0,
    scheduled = null,
    canceled = 0,
    reads = 0;
  let image = null;
  const changes = [],
    sounds = [];
  const manager = core.createClipboardManager({
    clipboard: {
      availableFormats: () => formats,
      readImage: () => image,
      readText: () => {
        reads++;
        return text;
      },
    },
    config: { ...core.defaults, ...config },
    now: () => clock,
    changed: (state) => changes.push(state),
    sound: (volume) => sounds.push(volume),
    schedule: (fn, ms) => {
      assert.equal(ms, 850);
      scheduled = fn;
      return 1;
    },
    cancel: () => {
      canceled++;
      scheduled = null;
    },
  });
  manager.setMasterSound(true);
  manager.setActive(true);
  return {
    manager,
    changes,
    sounds,
    copy(value, types = ['text/plain']) {
      text = value;
      formats = types;
      clock += 2500;
      manager.tick();
    },
    copyImage(value) {
      image = value;
      formats = ['image/png'];
      clock += 2500;
      manager.tick();
    },
    advance(ms) {
      clock += ms;
      manager.tick();
    },
    get reads() {
      return reads;
    },
    get canceled() {
      return canceled;
    },
    get scheduled() {
      return scheduled;
    },
  };
}
test('opt-in: desativado não lê clipboard nem agenda monitor; pausa/retomada estabelece baseline', () => {
  const f = fixture();
  assert.equal(f.reads, 0);
  assert.equal(f.scheduled, null);
  f.manager.configure({ enabled: true });
  assert.equal(f.manager.state().pending, false);
  assert.deepEqual(f.sounds, []);
  f.copy('Texto novo válido');
  assert.equal(f.manager.state().pending, true);
  f.manager.configure({ paused: true });
  const reads = f.reads;
  f.copy('Texto durante pausa');
  assert.equal(f.reads, reads);
  assert.equal(f.manager.state().pending, false);
  f.manager.configure({ paused: false });
  assert.equal(f.manager.state().pending, false);
  f.manager.configure({ enabled: false });
  assert.equal(f.scheduled, null);
});
test('classifica texto, código, URL e ignora imagem quando o runtime não a disponibiliza', () => {
  const f = fixture({ enabled: true });
  for (const [text, type] of [
    ['Uma frase normal.', 'text'],
    ['const soma = (a, b) => a + b;', 'code'],
    ['https://example.com/docs', 'link'],
  ]) {
    f.copy(text);
    assert.equal(f.manager.state().notification.contentType, type);
  }
  const reads = f.reads;
  f.copy('Texto alternativo', ['image/png', 'text/plain']);
  assert.equal(f.reads, reads);
  assert.equal(f.manager.state().pending, false);
});
test('repetido não notifica; som único tem volume, intervalo mínimo, mute e silêncio global', () => {
  const f = fixture({ enabled: true, volume: 0.4 });
  f.copy('Primeira mensagem válida');
  f.manager.tick();
  assert.deepEqual(f.sounds, [0.4]);
  f.copy('Primeira mensagem válida');
  assert.equal(f.sounds.length, 1);
  f.manager.setMasterSound(false);
  f.copy('Segunda mensagem válida');
  assert.equal(f.sounds.length, 1);
  f.manager.setMasterSound(true);
  f.manager.configure({ sound: false });
  f.copy('Terceira mensagem válida');
  assert.equal(f.sounds.length, 1);
  f.manager.configure({ sound: true, volume: 0 });
  f.copy('Quarta mensagem válida');
  assert.equal(f.sounds.length, 1);
  let text = 'Texto inicial',
    clock = 0,
    count = 0;
  const manager = core.createClipboardManager({
    clipboard: { availableFormats: () => [], readText: () => text },
    config: { ...core.defaults, enabled: true },
    now: () => clock,
    sound: () => count++,
    schedule: () => 1,
    cancel() {},
  });
  manager.setMasterSound(true);
  manager.setActive(true);
  text = 'Nova cópia válida';
  manager.tick();
  text = 'Outra cópia válida';
  clock = 500;
  manager.tick();
  assert.equal(count, 1);
  clock = 2500;
  text = 'Última cópia válida';
  manager.tick();
  assert.equal(count, 2);
  manager.destroy();
});
for (const first of ['main', 'quick'])
  test(`abertura ${first} primeiro remove indicadores e exclui ações no outro ambiente`, async () => {
    const f = fixture({ enabled: true });
    f.copy('Texto para reivindicação exclusiva');
    const [winner, loser] = await Promise.all([
      Promise.resolve().then(() => f.manager.claim(first)),
      Promise.resolve().then(() => f.manager.claim(first === 'main' ? 'quick' : 'main')),
    ]);
    assert.equal(winner.ok, true);
    assert.equal(loser.ok, false);
    assert.equal(loser.reason, 'ALREADY_CLAIMED_OR_IDLE');
    assert.equal(f.manager.state().pending, false);
    assert.equal(winner.notification.claimedBy, first);
    assert.equal(f.changes.at(-1).pending, false);
    assert.equal(JSON.stringify(f.changes).includes('Texto para reivindicação'), false);
  });
test('substitui pendente; nova cópia preserva conteúdo já reivindicado durante edição', () => {
  const f = fixture({ enabled: true });
  f.copy('Texto antigo');
  f.copy('Texto mais recente');
  const old = f.manager.claim('quick');
  assert.equal(old.notification.text, 'Texto mais recente');
  f.copy('Nova cópia independente');
  assert.equal(f.manager.state().pending, true);
  assert.equal(f.manager.claim('quick').reason, 'BUSY');
  assert.equal(old.notification.text, 'Texto mais recente');
  const main = f.manager.claim('main');
  assert.equal(main.notification.text, 'Nova cópia independente');
  assert.equal(f.manager.dismiss('main', old.notification.id), false);
  assert.equal(f.manager.dismiss('quick', old.notification.id), true);
});
test('limites, dados sensíveis e URLs inseguras recusados sem prévia', () => {
  const f = fixture({ enabled: true });
  for (const text of [
    'senha=segredo123',
    'password: test',
    'Bearer supersecret',
    'sk-' + 'a'.repeat(40),
    'https://example.com?token=abc',
    'https://u:p@example.com',
    'javascript:alert(1)',
    'file:///C:/secret',
    'AbCd1234!xyz',
    'a'.repeat(core.MAX_CHARS + 1),
  ]) {
    f.copy(text);
    assert.equal(f.manager.state().pending, false, 'deve bloquear conteúdo sensível ou inválido');
  }
  assert.equal(f.sounds.length, 0);
  assert.equal(core.classify('Texto '.repeat(900)).contentType, 'text');
  assert.equal(core.safeURL('https://example.com/'), 'https://example.com/');
  assert.equal(core.safeURL('https://example.com/\n'), null);
});
test('pausar, sair da sessão, TTL e encerramento limpam referências e cancelam monitor', () => {
  const f = fixture({ enabled: true });
  f.copy('Texto de teste');
  const claim = f.manager.claim('main');
  f.advance(core.TTL);
  assert.deepEqual(f.manager.state().owned, {});
  assert.equal(f.manager.dismiss('main', claim.notification.id), false);
  f.copy('Outra mensagem');
  f.manager.setActive(false);
  assert.equal(f.manager.state().pending, false);
  const reads = f.reads;
  f.copy('Cópia sem sessão');
  assert.equal(f.reads, reads);
  f.manager.setActive(true);
  f.copy('Mensagem antes de fechar');
  f.manager.destroy();
  assert.equal(f.manager.state().pending, false);
  assert.deepEqual(f.manager.state().owned, {});
  assert.equal(f.scheduled, null);
});
test('ícone overlay é circular com transparência e borda; som é WAV PCM curto local', () => {
  let bitmap;
  core.overlay({
    createFromBitmap: (pixels, dimensions) => {
      bitmap = pixels;
      assert.deepEqual(dimensions, { width: 16, height: 16 });
    },
  });
  assert.equal(bitmap[3], 0);
  assert.equal(bitmap[(8 * 16 + 8) * 4 + 3], 255);
  const wav = Buffer.from(core.chime().split(',')[1], 'base64');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.ok(wav.length < 20000);
  assert.throws(() => core.settings({ volume: 2 }));
});

function imageFixture(width, height, bytes) {
  return {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    toPNG: () => Buffer.alloc(bytes, 7),
    resize: (size) => ({
      toPNG: () =>
        Buffer.alloc(
          Math.max(1, Math.round((bytes * size.width * size.height) / (width * height))),
          7,
        ),
    }),
  };
}
test('imagem tem prévia local limitada, identificação repetida e payload exclusivo sem broadcast', () => {
  const f = fixture({ enabled: true });
  const image = imageFixture(2400, 1600, core.MAX_IMAGE_SOURCE_BYTES);
  f.copyImage(image);
  assert.equal(f.manager.state().notification.contentType, 'image');
  const id = f.manager.state().notification.id;
  f.copyImage(image);
  assert.equal(f.manager.state().notification.id, id);
  assert.equal(f.sounds.length, 1);
  const claim = f.manager.claim('quick');
  assert.equal(claim.ok, true);
  assert.ok(claim.notification.width <= core.MAX_IMAGE_EDGE);
  assert.ok(claim.notification.height <= core.MAX_IMAGE_EDGE);
  assert.ok(
    Buffer.from(claim.notification.imageData.split(',')[1], 'base64').length <=
      core.MAX_IMAGE_PREVIEW_BYTES,
  );
  assert.equal(JSON.stringify(f.changes).includes('imageData'), false);
  assert.equal(f.manager.claim('main').ok, false);
  assert.equal(f.reads, 1);
  f.manager.configure({ paused: true });
  assert.deepEqual(f.manager.state().owned, {});
});
test('imagem acima de 5 MB, 50 MP ou vazia não gera conteúdo ou som', () => {
  const f = fixture({ enabled: true });
  f.copyImage(imageFixture(100, 100, core.MAX_IMAGE_SOURCE_BYTES + 1));
  assert.equal(f.manager.state().pending, false);
  let serialized = false;
  f.copyImage({
    isEmpty: () => false,
    getSize: () => ({ width: 10000, height: 10000 }),
    toPNG: () => {
      serialized = true;
      return Buffer.alloc(10);
    },
  });
  assert.equal(serialized, false);
  assert.equal(f.manager.state().pending, false);
  f.copyImage({ isEmpty: () => true });
  assert.equal(f.manager.state().pending, false);
  assert.equal(f.sounds.length, 0);
});

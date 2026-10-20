const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const runtime = require('./backend-runtime');

function fixture() {
  const child = new EventEmitter();
  let kills = 0,
    starts = 0,
    options;
  child.kill = () => {
    kills++;
    child.emit('exit', 0);
  };
  const config = {
    resources: 'C:/fixture/resources',
    dataDir: 'C:/fixture/private',
    executable: 'C:/fixture/JARVIS.exe',
    version: '1.0.0',
    spawnProcess: (...args) => {
      starts++;
      options = args;
      return child;
    },
    portAvailable: async () => {},
    wait: async () => {},
    attempts: 2,
  };
  const healthy = {
    ok: true,
    service: 'jarvis',
    version: '1.0.0',
    installation: runtime.identity(config.executable),
  };
  return {
    config,
    healthy,
    child,
    get kills() {
      return kills;
    },
    get starts() {
      return starts;
    },
    get options() {
      return options;
    },
  };
}

test('backend empacotado reutiliza serviço identificado e nunca o encerra', async () => {
  const f = fixture();
  f.config.health = async () => f.healthy;
  const service = await runtime.start(f.config);
  await service.stop();
  assert.equal(service.reused, true);
  assert.equal(f.starts, 0);
  assert.equal(f.kills, 0);
});
test('backend empacotado aguarda saúde e encerra somente o filho próprio', async () => {
  const f = fixture();
  let checks = 0;
  f.config.health = async () => (++checks >= 3 ? f.healthy : null);
  const service = await runtime.start(f.config);
  assert.equal(service.reused, false);
  assert.equal(f.starts, 1);
  assert.equal(f.options[2].shell, false);
  assert.equal(f.options[2].windowsHide, true);
  assert.equal(f.options[2].env.JARVIS_DATA_DIR, f.config.dataDir);
  assert.deepEqual(f.options[1], ['--parent', String(process.pid)]);
  await service.stop();
  await service.stop();
  assert.equal(f.kills, 1);
});
test('backend empacotado recusa serviço externo e versão incompatível', async () => {
  const f = fixture();
  f.config.health = async () => ({ ...f.healthy, version: '0.8.3' });
  await assert.rejects(runtime.start(f.config), /outro backend/);
  assert.equal(f.starts, 0);
});
test('timeout limpa backend próprio sem encerrar ocupantes externos', async () => {
  const f = fixture();
  f.config.health = async () => null;
  await assert.rejects(runtime.start(f.config), /45 segundos/);
  assert.equal(f.kills, 1);
  f.config.portAvailable = async () => {
    throw Error('porta ocupada');
  };
  await assert.rejects(runtime.start(f.config), /porta ocupada/);
  assert.equal(f.starts, 1);
});
test('falha de processo empacotado é tratada sem rejeição não observada', async () => {
  const f = fixture();
  f.config.health = async () => null;
  f.config.wait = async () => f.child.emit('error', Error('ausente'));
  await assert.rejects(runtime.start(f.config), /não iniciou/);
  assert.equal(f.kills, 0);
});

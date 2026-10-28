const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { resolveData, configureElectron } = require('../../scripts/app/portable-paths');

test('portátil resolve dados pelo executável externo e acompanha mudança de unidade', () => {
  for (const drive of ['E:', 'Z:']) {
    const executable = path.resolve(drive, 'JARVIS/app/JARVIS.exe');
    assert.equal(resolveData({ packaged: true, executable }), path.resolve(drive, 'JARVIS/data'));
  }
  assert.throws(() => resolveData({ override: 'relative' }));
});

test('todos os perfis persistentes do Electron ficam na área portátil', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-paths-'));
  try {
    const paths = {};
    configureElectron(
      {
        setPath: (key, value) => {
          paths[key] = value;
        },
      },
      root,
    );
    assert.deepEqual(Object.keys(paths).sort(), ['crashDumps', 'logs', 'sessionData', 'userData']);
    for (const file of Object.values(paths)) {
      assert.ok(file.startsWith(root + path.sep));
      assert.ok(fs.statSync(file).isDirectory());
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

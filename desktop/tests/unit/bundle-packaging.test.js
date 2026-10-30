const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs');
const hook = require('../../scripts/app/bundle-packaging.cjs');
const appDir = path.resolve(__dirname, '../..');
test('bundled Desktop validates every native dependency before skipping the dependency hoister', async () => {
  assert.equal(await hook({ appDir }), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(appDir,'electron/cloud-config.json'),'utf8')).origin,new URL(process.env.CYRO_BACKEND_ORIGIN || process.env.JARVIS_CLOUD_ORIGIN || 'https://api.cyro-ia.tech').origin);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(appDir, 'electron/runtime-files.json'), 'utf8'),
  );
  assert.ok(!manifest.includes('scripts/app/bundle-packaging.cjs'));
  for (const file of ['electron/builder.json', 'electron-builder.json'])
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(appDir, file), 'utf8')).beforeBuild,
      './scripts/app/bundle-packaging.cjs',
    );
});
test('packaging refuses an incomplete application', async () => {
  await assert.rejects(hook({ appDir: path.join(appDir, 'tests') }));
});

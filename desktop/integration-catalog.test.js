const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const output = buildSync({
  entryPoints: [path.join(__dirname, 'integration-catalog.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;
const mod = { exports: {} };
vm.runInNewContext(output, { module: mod, exports: mod.exports });
const { integrationCatalog: catalog, filterIntegrations: filter } = mod.exports;

test('catálogo tipado contém seis definições locais imutáveis, todas em breve', () => {
  assert.deepEqual(
    Array.from(catalog, (x) => x.name),
    ['Spotify', 'Discord', 'Google Calendar', 'GitHub', 'Notion', 'Google Drive'],
  );
  assert.equal(new Set(catalog.map((x) => x.id)).size, 6);
  assert(Object.isFrozen(catalog));
  for (const definition of catalog) {
    assert.equal(definition.status, 'coming_soon');
    assert(Object.isFrozen(definition));
    assert(Object.isFrozen(definition.capabilities));
    for (const key of ['id', 'name', 'description', 'category', 'icon'])
      assert.equal(typeof definition[key], 'string');
    assert(definition.capabilities.length > 0);
  }
});
test('pesquisa encontra nome, categoria e descrição sem diferenciar caixa ou acentos', () => {
  assert.equal(filter(catalog, 'SPOTIFY', 'all')[0].id, 'spotify');
  assert.equal(filter(catalog, 'comunicacao', 'all')[0].id, 'discord');
  assert.equal(filter(catalog, 'REPOSITORIOS', 'all')[0].id, 'github');
  assert.equal(filter(catalog, '  google   arquivos ', 'all')[0].id, 'google-drive');
  assert.equal(filter(catalog, 'inexistente', 'all').length, 0);
});
test('filtros refletem estados do catálogo, sem inventar conexões', () => {
  assert.equal(filter(catalog, '', 'all').length, 6);
  assert.equal(filter(catalog, '', 'coming_soon').length, 6);
  assert.equal(filter(catalog, '', 'connected').length, 0);
  assert.equal(filter(catalog, '', 'available').length, 0);
  // Future-state fixtures exist only in tests; production catalog stays coming_soon.
  const fixture = ['coming_soon', 'available', 'connected', 'disconnected', 'error'].map(
    (status, index) => ({ ...catalog[0], id: String(index), status }),
  );
  assert.deepEqual(
    Array.from(filter(fixture, '', 'connected'), (x) => x.status),
    ['connected'],
  );
  assert.deepEqual(
    Array.from(filter(fixture, '', 'available'), (x) => x.status),
    ['available', 'disconnected'],
  );
  assert.equal(filter(fixture, '', 'all').length, 5);
  assert.equal(filter([], '', 'all').length, 0);
});

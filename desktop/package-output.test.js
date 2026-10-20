const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePackageOutput } = require('./package-output');
test('árvore npm aceita JSON limpo, BOM e aviso de codepage do Windows', () => {
  const value = { name: 'fixture', dependencies: {} };
  for (const prefix of ['', '\uFEFF', 'Página de código ativa: 65001\r\n']) {
    assert.deepEqual(parsePackageOutput(prefix + JSON.stringify(value)), value);
  }
});
test('saída npm inválida interrompe o empacotamento', () => {
  assert.throws(() => parsePackageOutput('Falha do npm'));
  assert.throws(() => parsePackageOutput('{"dependencies":'));
});

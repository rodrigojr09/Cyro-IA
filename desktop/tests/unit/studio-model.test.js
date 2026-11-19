const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { uniqueFilename, safeFilename, csvFor } = require('../../scripts/workspace/studio-model');
test('v9 editable upload copies and chat code avoid overwriting an existing edited file', () => {
  assert.doesNotMatch(safeFilename('../../CON.txt'), /[\\/]|\.\./);
  const files = [{ name: 'main.py', content: 'user edit' }];
  assert.equal(uniqueFilename(files, 'main.py', 'chat code'), 'main-2.py');
  assert.equal(uniqueFilename(files, 'main.py', 'user edit'), 'main.py');
  assert.equal(uniqueFilename(files, 'main.py', 'user edit', false), 'main-2.py');
});
test('table CSV preserves numeric cells and neutralizes untrusted spreadsheet formulas', () => {
  const csv = csvFor({
    columns: ['Valor'],
    rows: [[-10], [' =HYPERLINK("https://evil")'], ['a,b']],
  });
  assert.match(csv, /' =HYPERLINK/);
  assert.match(csv, /"-10"/);
  assert.match(csv, /"a,b"/);
});

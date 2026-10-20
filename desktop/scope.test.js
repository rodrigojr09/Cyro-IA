const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
async function setup(confirmed = false) {
  class Element {
    constructor() {
      this.children = [];
      this.disabled = false;
      this.checked = false;
    }
    appendChild(child) {
      this.children.push(child);
    }
    replaceChildren() {
      this.children = [];
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
  }
  const elements = {},
    calls = [];
  const document = {
    getElementById: (id) => (elements[id] ??= new Element()),
    createElement: () => new Element(),
  };
  const api = async (route, options) => {
    calls.push({ route, options });
    if (options) return { selection_changed: true };
    const relative = new URLSearchParams(route.split('?')[1]).get('path');
    return {
      selection: { confirmed, include: ['src'], exclude: ['src/helper.ts'] },
      next_offset: null,
      entries:
        relative === 'src'
          ? [
              { name: 'main.ts', path: 'src/main.ts', type: 'file' },
              { name: 'helper.ts', path: 'src/helper.ts', type: 'file' },
            ]
          : [
              { name: 'src', path: 'src', type: 'directory' },
              {
                name: 'package-lock.json',
                path: 'package-lock.json',
                type: 'file',
                disabled: true,
                reason: 'Gerado',
              },
              { name: 'dist', path: 'dist', type: 'directory', disabled: true, reason: 'Build' },
            ],
    };
  };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'scope.js'), 'utf8'), {
    window,
    document,
    api,
    encodeURIComponent,
  });
  await window.jarvisScope.open({ id: 'fixture', name: 'Fictício' });
  return { window, elements, calls };
}
test('prévia e cancelamento não enviam arquivos nem iniciam análise', async () => {
  const { elements, calls } = await setup();
  assert.equal(elements['scope-dialog'].open, true);
  assert.ok(calls.every((call) => !call.options));
  assert.equal(elements['scope-list'].children[1].children[0].children[0].disabled, true);
  assert.equal(elements['scope-list'].children[2].children[0].children[0].disabled, true);
  elements['scope-cancel'].onclick();
  assert.equal(elements['scope-dialog'].open, false);
  assert.ok(calls.every((call) => !call.options));
});
test('desmarcar arquivo persiste exclusão somente ao confirmar', async () => {
  const { elements, calls } = await setup();
  await elements['scope-list'].children[0].children[1].onclick();
  const helper = elements['scope-list'].children[1].children[0].children[0];
  assert.equal(helper.checked, true);
  helper.checked = false;
  helper.onchange();
  assert.ok(calls.every((call) => !call.options));
  await elements['scope-save'].onclick();
  const body = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(body.include, ['.']);
  assert.deepEqual(body.exclude, ['src/helper.ts']);
  assert.equal(elements['scope-dialog'].open, false);
});
test('reabrir respeita regras salvas e seleção de pasta inclui descendentes', async () => {
  const { elements } = await setup(true);
  await elements['scope-list'].children[0].children[1].onclick();
  assert.equal(elements['scope-list'].children[0].children[0].children[0].checked, true);
  assert.equal(elements['scope-list'].children[1].children[0].children[0].checked, false);
  elements['scope-all'].onclick();
  assert.equal(elements['scope-list'].children[1].children[0].children[0].checked, true);
});

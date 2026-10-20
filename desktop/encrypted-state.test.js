const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { create } = require('./encrypted-state');

test('preferências e rascunhos persistem criptografados e acompanham o dispositivo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-state-'));
  try {
    const key = crypto.randomBytes(32).toString('base64');
    const file = path.join(root, 'config/browser-state.json');
    const state = create(root, key);
    const value = { draft: 'PRIVATE_DRAFT_MARKER', voice: false };
    state.writeJSON(file, value);
    assert.equal(fs.readFileSync(file).includes('PRIVATE_DRAFT_MARKER'), false);
    assert.deepEqual(state.readJSON(file), value);
    const moved = path.join(root, 'moved');
    fs.mkdirSync(path.join(moved, 'config'), { recursive: true });
    fs.copyFileSync(file, path.join(moved, 'config/browser-state.json'));
    assert.deepEqual(
      create(moved, key).readJSON(path.join(moved, 'config/browser-state.json')),
      value,
    );
    assert.throws(() => create(root, crypto.randomBytes(32).toString('base64')).readJSON(file));
    const corrupted = fs.readFileSync(file);
    corrupted[corrupted.length - 1] ^= 1;
    fs.writeFileSync(file, corrupted);
    assert.throws(() => state.readJSON(file));
    assert.throws(() => state.writeJSON(path.join(root, '..', 'outside.json'), value));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

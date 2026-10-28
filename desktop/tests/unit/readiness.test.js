const test = require('node:test');
const assert = require('node:assert/strict');
const { createReadiness } = require('../../scripts/session/readiness');
test('revalidação preserva workspace; novo login exige bootstrap e confirmação', () => {
  const changes = [];
  const state = createReadiness({ authenticated: true, changed: (v) => changes.push(v) });
  assert.throws(() => state.acknowledge());
  const first = state.begin();
  assert.equal(state.finish(first, true), true);
  state.acknowledge();
  assert.equal(state.transition(true), false);
  assert.equal(state.ready(), true);
  state.transition(false);
  assert.equal(state.ready(), false);
  state.transition(true);
  assert.equal(state.finish(first, true), false);
  assert.throws(() => state.acknowledge());
  const old = state.begin(),
    current = state.begin();
  assert.equal(state.finish(old, true), false);
  assert.equal(state.finish(current, true), true);
  state.acknowledge();
  assert.equal(state.ready(), true);
  assert.deepEqual(changes, [true, false, true]);
});

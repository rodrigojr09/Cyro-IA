const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, deferred, act } = require('../helpers/react.cjs');
const { fixture } = require('../helpers/fixture.cjs');
async function setup(options) {
  const env = environment(),
    f = fixture(env, options),
    workspace = env.createWorkspace({ api: f.transport, post: f.post });
  return {
    env,
    f,
    workspace,
    async close() {
      workspace.dispose();
      await env.dispose();
    },
  };
}
test('startup loads metadata only; first opening loads history and later openings reuse the local cache', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    assert.equal(t.f.calls.filter((row) => row.route === '/workspace/bootstrap').length, 1);
    assert.equal(t.f.calls.filter((row) => row.route === '/storage').length, 1);
    assert.equal(t.workspace.get().chat, null);
    assert.equal(t.f.calls.filter(row => row.route?.startsWith('/chats/history')).length, 0);
    for (const id of ['first', 'second', 'first']) await t.workspace.view('project-a', id);
    assert.equal(t.f.calls.filter((row) => row.route?.startsWith('/chats/history')).length, 2);
    assert.equal(t.workspace.get().messages[0].content, 'Contexto first');
  } finally {
    await t.close();
  }
});
test('bootstrap is shared by simultaneous callers', async () => {
  const pending = deferred(),
    t = await setup({ bootstrap: pending.promise });
  try {
    const a = t.workspace.initialize(),
      b = t.workspace.initialize();
    pending.resolve({ projects: [t.f.project], chats: t.f.chats, histories: t.f.histories });
    await Promise.all([a, b]);
    assert.equal(t.f.calls.filter((row) => row.route === '/workspace/bootstrap').length, 1);
  } finally {
    await t.close();
  }
});
test('failed bootstrap never enables sending and a retry clears partial state', async () => {
  const t = await setup();
  const transport = t.f.transport;
  let fails = true;
  const workspace = t.env.createWorkspace({
    api: async (...args) => {
      if (args[0] === '/workspace/bootstrap' && fails) {
        fails = false;
        throw Error('Offline');
      }
      return transport(...args);
    },
    post: t.f.post,
  });
  try {
    await assert.rejects(workspace.initialize(), /Offline/);
    assert.equal(workspace.canSend(), false);
    await workspace.initialize();
    assert.equal(workspace.canSend(), true);
  } finally {
    workspace.dispose();
    await t.close();
  }
});
test('disposing a session ignores a late snapshot and never exposes its history', async () => {
  const pending = deferred(),
    t = await setup({ bootstrap: pending.promise });
  try {
    const loading = t.workspace.initialize();
    t.workspace.dispose();
    pending.resolve({ projects: [t.f.project], chats: t.f.chats, histories: t.f.histories });
    await loading;
    assert.equal(t.workspace.get().ready, false);
    assert.deepEqual(t.workspace.get().messages, []);
  } finally {
    await t.close();
  }
});
test('project and chat IDs cannot be mixed through navigation', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'general');
    assert.equal(t.workspace.get().chat, null);
    assert.deepEqual(t.workspace.get().messages, []);
  } finally {
    await t.close();
  }
});
test('partial projects block chat without silently accepting incomplete analysis', async () => {
  const t = await setup();
  try {
    t.f.project.ready = 0;
    t.f.project.state = 'partial';
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    assert.equal(t.workspace.canSend(), false);
    assert.equal(await t.workspace.send('Do not call AI'), false);
    assert.ok(!t.f.calls.some((row) => row.route === '/chat'));
  } finally {
    await t.close();
  }
});
test('an archived chat cannot send', async () => {
  const t = await setup();
  try {
    t.f.chats[1].archived = 1;
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    assert.equal(t.workspace.canSend(), false);
  } finally {
    await t.close();
  }
});
test('storage full blocks new sends while read-only navigation still works', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    t.workspace.set({ storage: { cloud: { blocked: true } } });
    await t.workspace.view('project-a', 'first');
    assert.equal(t.workspace.get().chat.id, 'first');
    assert.equal(await t.workspace.send('No AI'), false);
  } finally {
    await t.close();
  }
});
test('two simultaneous sends share the preflight guard', async () => {
  const pending = deferred(),
    t = await setup({ send: () => pending.promise });
  try {
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    const a = t.workspace.send('First'),
      b = t.workspace.send('Second');
    assert.equal(await b, false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(t.f.calls.filter((row) => row.route === '/chat').length, 1);
    pending.resolve({ reply: 'Done', pending_actions: [] });
    await a;
  } finally {
    await t.close();
  }
});
test('project size is checked before sending and a failure never calls AI', async () => {
  const t = await setup();
  let checked = false;
  const workspace = t.env.createWorkspace({
    api: t.f.transport,
    post: async (route, data) => {
      if (route === '/projects/selection/size') {
        checked = true;
        return { selected_bytes: 6291456, max_bytes: 5242880, within_limit: false };
      }
      return t.f.post(route, data);
    },
  });
  try {
    await workspace.initialize();
    await workspace.view('project-a', 'first');
    await assert.rejects(workspace.send('Too large'), /5 MB/);
    assert.equal(checked, true);
    assert.ok(!t.f.calls.some((row) => row.route === '/chat'));
    assert.equal(workspace.get().busy, false);
  } finally {
    workspace.dispose();
    await t.close();
  }
});
test('draft creates one saved chat on the first confirmed send only', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    assert.ok(!t.f.calls.some((row) => row.route === '/chats/create'));
    await t.workspace.send('Confirmed question');
    assert.equal(t.f.calls.filter((row) => row.route === '/chats/create').length, 1);
    assert.equal(
      JSON.parse(t.f.calls.find((row) => row.route === '/chat').options.body).chat_id,
      t.workspace.get().chat.id,
    );
  } finally {
    await t.close();
  }
});
test('durable receipt updates both history and revision without a second fetch', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    await t.workspace.send('Question');
    await t.workspace.view('project-a', 'second');
    await t.workspace.view('project-a', 'first');
    assert.equal(t.workspace.get().messages.at(-1).content, 'Resposta salva.');
    assert.equal(t.f.calls.filter(row => row.route?.startsWith('/chats/history')).length, 2);
  } finally {
    await t.close();
  }
});
test('external deletion clears the selected conversation and its cached content', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    t.f.chats.splice(1, 1);
    await t.workspace.refresh();
    assert.equal(t.workspace.get().chat, null);
    assert.deepEqual(t.workspace.get().messages, []);
  } finally {
    await t.close();
  }
});
test('indexing uses local progress without remote catalog scans between five-minute syncs', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    t.f.project.state = 'indexing';
    await t.workspace.refresh(false);
    assert.equal(t.f.calls.filter((row) => row.route === '/workspace/progress').length, 1);
    assert.equal(t.f.calls.filter((row) => row.route === '/workspace').length, 0);
  } finally {
    await t.close();
  }
});
test('hidden windows do not poll the catalog', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
    await t.workspace.refresh();
    assert.equal(t.f.calls.filter((row) => row.route === '/workspace').length, 0);
  } finally {
    await t.close();
  }
});
test('large history loads in pages after opening and keeps the fetched pages in the local cache', async () => {
  const t = await setup();
  try {
    t.f.histories.first = Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      role: 'user',
      content: String(index),
    }));
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    assert.equal(t.workspace.get().visible, 100);
    await t.workspace.older();
    await t.workspace.older();
    await t.workspace.older();
    assert.equal(t.workspace.get().messages.length, 250);
    assert.equal(t.f.calls.filter(row => row.route?.startsWith('/chats/history')).length, 3);
    await t.workspace.view('project-a', 'second');
    await t.workspace.view('project-a', 'first');
    assert.equal(t.workspace.get().messages.length, 250);
    assert.equal(t.f.calls.filter(row => row.route?.startsWith('/chats/history')).length, 4);
  } finally {
    await t.close();
  }
});

test('native acknowledgment holds sending until the renderer finished startup', async () => {
  const t = await setup();
  const ack = deferred();
  window.jarvisWindow.workspaceReady = () => ack.promise;
  try {
    const init = t.workspace.initialize();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(t.workspace.get().ready, false);
    assert.equal(t.workspace.canSend(), false);
    ack.resolve(true);
    await init;
    assert.equal(t.workspace.get().ready, true);
  } finally {
    await t.close();
  }
});


test('saved selection does not preload messages; New chat stays a draft and retries keep stable operation IDs', async () => {
  const t = await setup();
  try {
    localStorage.setItem('jarvis.selection', JSON.stringify({ project: 'project-a', chat: 'first' }));
    await t.workspace.initialize();
    assert.equal(t.workspace.get().chat, null);
    assert.equal(t.f.calls.filter(c => c.route?.startsWith('/chats/history')).length, 0);
    await t.workspace.newChat('');
    assert.equal(t.f.calls.filter(c => c.route === '/chats/create').length, 0);
    await t.workspace.send('Primeira mensagem');
    assert.equal(t.f.calls.filter(c => c.route === '/chats/create').length, 1);
    assert.ok(JSON.parse(t.f.calls.find(c => c.route === '/chats/create').options.body).request_id);
    assert.ok(JSON.parse(t.f.calls.find(c => c.route === '/chat').options.body).operation_id);
  } finally { await t.close(); }
});


test('opening by notification reuses an unchanged cached conversation', async () => {
  const t = await setup();
  try {
    await t.workspace.initialize();
    await t.workspace.view('project-a', 'first');
    const reads = t.f.calls.filter(c => c.route?.startsWith('/chats/history')).length;
    await t.workspace.openById('first');
    assert.equal(t.f.calls.filter(c => c.route?.startsWith('/chats/history')).length, reads);
  } finally { await t.close(); }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, click, input, settle, deferred, act, React } = require('../helpers/react.cjs');
const { fixture } = require('../helpers/fixture.cjs');

test('React login submits only through the private bridge and clears the password', async () => {
  const env = environment(),
    f = fixture(env);
  try {
    await env.mount(env.Login);
    await input('#login-email', 'person@example.test');
    await input('#login-password', 'a-private-password');
    await act(async () =>
      document
        .querySelector('#login-form')
        .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })),
    );
    assert.deepEqual(f.calls.find((row) => row.login).login, {
      email: 'person@example.test',
      password: 'a-private-password',
    });
    assert.equal(document.querySelector('#login-password').value, '');
    assert.match(document.querySelector('#login-status').textContent, /Conectado/);
  } finally {
    await env.dispose();
  }
});
test('React workspace blocks sending until the entire bootstrap resolves and renders loaded history', async () => {
  const env = environment(),
    pending = deferred(),
    f = fixture(env, { bootstrap: pending.promise }),
    workspace = env.createWorkspace({ api: f.transport, post: f.post });
  try {
    await env.mount(env.App, { workspace });
    assert.equal(document.querySelector('#send').disabled, true);
    assert.equal(workspace.get().ready, false);
    await act(async () =>
      pending.resolve({ projects: [f.project], chats: f.chats, histories: f.histories }),
    );
    await settle();
    assert.equal(workspace.get().ready, true);
    await act(async () => workspace.view('project-a', 'first'));
    assert.match(document.querySelector('#messages').textContent, /Contexto first/);
    await act(async () => workspace.view('project-a', 'second'));
    await act(async () => workspace.view('project-a', 'first'));
    assert.equal(f.calls.filter((row) => row.route?.startsWith('/chats/history')).length, 0);
  } finally {
    await env.dispose();
  }
});
test('React chat waits for a durable response and keeps draft after failure', async () => {
  const env = environment(),
    pending = deferred(),
    f = fixture(env, { send: () => pending.promise }),
    workspace = env.createWorkspace({ api: f.transport, post: f.post });
  try {
    await env.mount(env.App, { workspace });
    await input('#input', 'Minha pergunta');
    await click('#send');
    assert.equal(document.querySelector('#input').value, '');
    assert.equal(document.querySelector('#send').disabled, true);
    assert.doesNotMatch(document.querySelector('#messages').textContent, /Resposta salva/);
    await act(async () => pending.reject(Error('Falha de persistência')));
    await settle();
    assert.equal(document.querySelector('#input').value, 'Minha pergunta');
    assert.match(document.querySelector('#status').textContent, /Falha de persistência/);
    assert.doesNotMatch(document.querySelector('#messages').textContent, /Resposta salva/);
  } finally {
    await env.dispose();
  }
});
test('React chat reuses acknowledged messages when switching away and back', async () => {
  const env = environment(),
    f = fixture(env),
    workspace = env.createWorkspace({ api: f.transport, post: f.post });
  try {
    await env.mount(env.App, { workspace });
    await act(async () => workspace.view('project-a', 'first'));
    await input('#input', 'Investigue o login');
    await click('#send');
    assert.match(document.querySelector('#messages').textContent, /Resposta salva/);
    await act(async () => workspace.view('project-a', 'second'));
    await act(async () => workspace.view('project-a', 'first'));
    assert.match(document.querySelector('#messages').textContent, /Resposta salva/);
    assert.equal(f.calls.filter((row) => row.route?.startsWith('/chats/history')).length, 0);
  } finally {
    await env.dispose();
  }
});
test('React Markdown renders tables and code without executing model HTML or unsafe links', async () => {
  const env = environment(),
    f = fixture(env);
  try {
    await env.mount(env.Markdown, {
      text: '<img src=x onerror="window.injected=true"><script>window.injected=true</script>\n\n[bad](javascript:alert(1)) [web](https://example.test)\n\n| A | B |\n|---|---|\n|1|2|\n\n```js\nconst safe=1;\n```',
    });
    assert.equal(document.querySelector('script'), null);
    assert.equal(document.querySelector('[onerror]'), null);
    assert.equal(window.injected, undefined);
    assert.ok(document.querySelector('table'));
    assert.ok(document.querySelector('code'));
    const anchors = [...document.querySelectorAll('a')];
    assert.ok(anchors.every((anchor) => !anchor.href.startsWith('javascript:')));
    await click(anchors.find((anchor) => anchor.textContent === 'web'));
    assert.equal(f.calls.find((row) => row.link).link, 'https://example.test');
  } finally {
    await env.dispose();
  }
});
test('React clipboard never sends automatically and requires an editable confirmation', async () => {
  const env = environment(),
    f = fixture(env);
  let sent = null;
  try {
    await env.mount(env.Clipboard, {
      context: 'first',
      onSend: async (text) => {
        sent = text;
        return true;
      },
    });
    await act(async () =>
      f.clipboard(
        {
          pending: true,
          owned: { main: 'copy-1' },
          notification: { id: 'copy-1' },
          settings: { enabled: true },
        },
        { id: 'copy-1', contentType: 'text', text: 'Texto copiado' },
      ),
    );
    await settle();
    assert.equal(sent, null);
    await click(
      [...document.querySelectorAll('#clipboard-actions button')].find(
        (node) => node.textContent === 'Resumir',
      ),
    );
    assert.equal(sent, null);
    await input('#clipboard-message', 'Revise esta mensagem antes de enviar.');
    await click('#clipboard-confirm');
    assert.equal(sent, 'Revise esta mensagem antes de enviar.');
    assert.equal(f.calls.find((row) => row.dismiss).dismiss, 'copy-1');
  } finally {
    await env.dispose();
    assert.equal(f.listeners().clipboard, 0);
  }
});
test('React clipboard images stay local and expose no send action', async () => {
  const env = environment(),
    f = fixture(env);
  let sends = 0;
  try {
    await env.mount(env.Clipboard, {
      context: 'first',
      onSend: async () => {
        sends++;
      },
    });
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'image-1' }, notification: { id: 'image-1' } },
        { id: 'image-1', contentType: 'image', imageData: 'data:image/png;base64,aA==' },
      ),
    );
    await settle();
    await click('#clipboard-title');
    assert.ok(document.querySelector('#clipboard-image'));
    assert.equal(document.querySelector('#clipboard-confirm'), null);
    assert.equal(document.querySelector('#clipboard-actions').children.length, 0);
    assert.equal(sends, 0);
  } finally {
    await env.dispose();
  }
});
test('React clipboard keeps review attached to its original conversation', async () => {
  const env = environment(),
    f = fixture(env);
  try {
    await env.mount(env.Clipboard, { context: 'first', onSend: async () => true });
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'copy-1' }, notification: { id: 'copy-1' } },
        { id: 'copy-1', contentType: 'text', text: 'PRIVATE_CHAT_A' },
      ),
    );
    await settle();
    await click('#clipboard-actions button');
    await env.mount(env.Clipboard, { context: 'second', onSend: async () => true });
    assert.equal(document.querySelector('#clipboard-card'), null);
    await env.mount(env.Clipboard, { context: 'first', onSend: async () => true });
    assert.ok(document.querySelector('#clipboard-preview'));
  } finally {
    await env.dispose();
  }
});
test('React integration catalog searches locally and calls Spotify only inside its details', async () => {
  const env = environment(),
    f = fixture(env);
  try {
    await env.mount(env.Integrations);
    assert.equal(f.calls.filter((row) => row.spotify).length, 0);
    await input('#integrations-search', 'música');
    assert.equal(document.querySelectorAll('.integration-card').length, 1);
    await click('.integration-card');
    assert.match(document.querySelector('#integration-details').textContent, /Spotify/);
    assert.equal(f.calls.find((row) => row.spotify).spotify.operation, 'status');
    assert.equal(document.querySelector('audio'), null);
    await click('#integration-details-back');
    assert.equal(document.querySelector('#integrations-search').value, 'música');
  } finally {
    await env.dispose();
  }
});
test('React Scope never reads blocked files and measures selection before saving', async () => {
  const env = environment(),
    f = fixture(env);
  let saves = 0;
  try {
    await env.mount(env.ScopeDialog, {
      project: f.project,
      onClose() {},
      onSaved: async () => {
        saves++;
      },
    });
    const boxes = [...document.querySelectorAll('#scope-list input')];
    assert.equal(boxes.length, 2);
    assert.equal(boxes[1].disabled, true);
    await click('#scope-save');
    assert.equal(saves, 1);
    const routes = f.calls.filter((row) => row.route).map((row) => row.route);
    assert.ok(
      routes.indexOf('/projects/selection/size') < routes.indexOf('/projects/selection/save'),
    );
    assert.ok(!routes.some((route) => route === '/chat'));
  } finally {
    await env.dispose();
  }
});
test('React Quick Chat gates on readiness and preserves a newer draft while a response is pending', async () => {
  const env = environment(),
    f = fixture(env),
    pending = deferred();
  window.quick.send = async (text) => {
    f.calls.push({ quick: text });
    return pending.promise;
  };
  try {
    f.quick({ ready: false });
    await env.mount(env.QuickApp, { panel: 'composer' });
    assert.equal(document.querySelector('#send').disabled, true);
    assert.equal(document.querySelector('#question').disabled, false);
    await input('#question', 'Draft while loading');
    assert.equal(document.querySelector('#question').value, 'Draft while loading');
    await act(async () => f.quick({ ready: true }));
    await input('#question', 'First question');
    await click('#send');
    assert.equal(document.querySelector('#question').value, '');
    await input('#question', 'New draft');
    await act(async () => pending.resolve({ ok: true }));
    assert.equal(document.querySelector('#question').value, 'New draft');
  } finally {
    await env.dispose();
    assert.equal(f.listeners().quick, 0);
  }
});
test('React attachments display an unavailable history notice without unsafe HTML', async () => {
  const env = environment();
  fixture(env);
  try {
    await env.mount(env.AttachmentList, {
      files: [{ id: 'file-a', name: '<img onerror=x>', size: 1, type: 'text/plain' }],
      unavailable: true,
    });
    assert.match(
      document.querySelector('.attachment-list').textContent,
      /Salvo localmente em outro Computador/,
    );
    assert.equal(document.querySelector('img'), null);
    assert.match(document.querySelector('strong').textContent, /<img/);
  } finally {
    await env.dispose();
  }
});

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
test('React clipboard offers Use without sending and dismisses only after applying', async () => {
  const env = environment(),
    f = fixture(env);
  let used = null;
  try {
    await env.mount(env.Clipboard, {
      context: 'first',
      onUseText: async (text) => {
        used = text;
        return true;
      },
    });
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'copy-1' }, notification: { id: 'copy-1' } },
        { id: 'copy-1', contentType: 'text', text: 'Texto copiado' },
      ),
    );
    await settle();
    assert.equal(used, null);
    assert.ok(document.querySelector('.attachment-text-suggestion'));
    assert.ok(document.querySelector('.attachment-suggested-text').textContent);
    assert.equal(document.querySelector('#clipboard-confirm'), null);
    await click('#clipboard-use');
    assert.equal(used, 'Texto copiado');
    assert.equal(f.calls.find((row) => row.dismiss).dismiss, 'copy-1');
  } finally {
    await env.dispose();
    assert.equal(f.listeners().clipboard, 0);
  }
});

test('React clipboard image Use imports locally and failed import keeps suggestion', async () => {
  const env = environment(),
    f = fixture(env);
  let imported = null,
    accept = false;
  try {
    await env.mount(env.Clipboard, {
      context: 'first',
      onAttachImage: async (image) => {
        imported = image;
        return accept;
      },
    });
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'image-1' }, notification: { id: 'image-1' } },
        { id: 'image-1', contentType: 'image', imageData: 'data:image/png;base64,aA==' },
      ),
    );
    await settle();
    assert.equal(imported, null);
    await click('#clipboard-use');
    assert.equal(imported, 'data:image/png;base64,aA==');
    assert.ok(document.querySelector('#clipboard-card'));
    assert.equal(
      f.calls.some((row) => row.dismiss),
      false,
    );
    accept = true;
    await click('#clipboard-use');
    assert.equal(document.querySelector('#clipboard-card'), null);
  } finally {
    await env.dispose();
  }
});

test('React clipboard suggestion stays attached to its original conversation', async () => {
  const env = environment(),
    f = fixture(env);
  let used = false;
  try {
    const props = {
      context: 'first',
      onUseText: () => {
        used = true;
        return true;
      },
    };
    await env.mount(env.Clipboard, props);
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'copy-1' }, notification: { id: 'copy-1' } },
        { id: 'copy-1', contentType: 'text', text: 'PRIVATE_CHAT_A' },
      ),
    );
    await settle();
    await env.mount(env.Clipboard, { ...props, context: 'second' });
    assert.equal(document.querySelector('#clipboard-card'), null);
    assert.equal(used, false);
    await env.mount(env.Clipboard, props);
    assert.ok(document.querySelector('#clipboard-use'));
  } finally {
    await env.dispose();
  }
});

test('React composer switches microphone to send and Use inserts parenthesized text into existing draft', async () => {
  const env = environment(),
    f = fixture(env),
    workspace = env.createWorkspace({ api: f.transport, post: f.post });
  try {
    await env.mount(env.App, { workspace });
    assert.equal(document.querySelector('#send').hidden, true);
    assert.equal(document.querySelector('#microphone').hidden, false);
    assert.equal(document.querySelector('#composer-context'), null);
    await input('#input', 'Minha pergunta');
    assert.equal(document.querySelector('#send').hidden, false);
    assert.equal(document.querySelector('#microphone').hidden, true);
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'copy-1' }, notification: { id: 'copy-1' } },
        { id: 'copy-1', contentType: 'text', text: 'Texto copiado' },
      ),
    );
    await settle();
    await click('#clipboard-use');
    assert.equal(document.querySelector('#input').value, 'Minha pergunta\n(Texto copiado)\n');
    assert.equal(
      f.calls.some((row) => row.route === '/chat'),
      false,
    );
    assert.equal(
      !!(
        document
          .querySelector('#attachment-list')
          .compareDocumentPosition(document.querySelector('.composer')) &
        window.Node.DOCUMENT_POSITION_FOLLOWING
      ),
      true,
    );
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

test('clipboard settings open, save, pause and disable without the floating widget', async () => {
  const env = environment();
  fixture(env);
  let settings = { enabled: false, paused: false, sound: true, volume: 0.25 };
  const writes = [];
  window.jarvisClipboard.state = async () => ({ settings });
  window.jarvisClipboard.configure = async (patch) => {
    writes.push(patch);
    settings = { ...settings, ...patch };
    return { settings };
  };
  try {
    await env.mount(env.ClipboardSettings);
    await settle();
    assert.equal(document.querySelector('#clipboard-volume').value, '25');
    await click('#clipboard-consent');
    await click('#clipboard-save');
    assert.equal(settings.enabled, true);
    await click('#clipboard-pause');
    assert.equal(settings.paused, true);
    await click('#clipboard-disable');
    assert.equal(settings.enabled, false);
    assert.equal(writes.length, 3);
  } finally {
    await env.dispose();
  }
});
test('a clipboard settings render failure stays inside its category and navigation recovers', async () => {
  const env = environment(),
    f = fixture(env);
  const original = console.error;
  const bad = {
    get enabled() {
      throw Error('Synthetic settings failure');
    },
    volume: 0.25,
  };
  window.jarvisClipboard.state = async () => ({ settings: bad });
  try {
    console.error = () => {};
    await env.mount(env.Settings, {
      open: true,
      onClose() {},
      workspace: { storage: async () => {} },
      state: {},
      preferences: { theme: 'dark' },
      onPreferences() {},
      onRun: async (fn) => fn(),
      onView() {},
    });
    await click(
      [...document.querySelectorAll('#settings-tabs button')].find(
        (b) => b.textContent === 'Área de transferência',
      ),
    );
    await settle();
    assert.ok(document.querySelector('#settings-retry-section'));
    assert.ok(document.querySelector('#settings-tabs'));
    window.jarvisClipboard.state = async () => ({
      settings: { enabled: false, sound: false, volume: 0.2 },
    });
    await click('#settings-retry-section');
    await settle();
    assert.ok(document.querySelector('#clipboard-consent'));
    await click(
      [...document.querySelectorAll('#settings-tabs button')].find(
        (b) => b.textContent === 'Aparência',
      ),
    );
    assert.ok(document.querySelector('#setting-theme'));
    assert.equal(document.querySelector('#settings-retry-section'), null);
  } finally {
    console.error = original;
    await env.dispose();
  }
});

test('pasted image becomes a preview attachment without sending a message', async () => {
  const env = environment(),
    f = fixture(env);
  let attachments;
  const imported = [];
  window.jarvisWindow.pasteImage = async (value) => {
    imported.push(value);
    return {
      ok: true,
      data: {
        files: [
          {
            id: 'image-a',
            kind: 'image',
            name: 'Imagem colada.png',
            size: 3,
            preview: 'data:image/png;base64,AQID',
          },
        ],
      },
    };
  };
  function Harness() {
    attachments = env.useAttachments();
    return React.createElement(env.AttachmentList, {
      files: attachments.files,
      onRemove: attachments.remove,
    });
  }
  try {
    await env.mount(Harness);
    const file = new window.File([new Uint8Array([1, 2, 3])], 'paste.png', { type: 'image/png' });
    await act(async () => attachments.paste([file]));
    assert.equal(imported.length, 1);
    assert.equal(imported[0].data, 'AQID');
    assert.ok(document.querySelector('img'));
    assert.equal(f.calls.filter((c) => c.route === '/chat').length, 0);
    await act(async () => attachments.paste(Array(5).fill(file)));
    assert.match(attachments.error, /5 arquivos/);
    assert.equal(imported.length, 1);
  } finally {
    await env.dispose();
  }
});
test('paste rejects unsupported images and discards a late response after context changes', async () => {
  const env = environment();
  fixture(env);
  let attachments;
  const pending = deferred(),
    discarded = [];
  let requests = 0;
  window.jarvisWindow.pasteImage = async () => {
    requests++;
    return pending.promise;
  };
  window.jarvisWindow.discardAttachment = async (id) => discarded.push(id);
  function Harness() {
    attachments = env.useAttachments();
    return null;
  }
  try {
    await env.mount(Harness);
    await act(async () =>
      attachments.paste([new window.File(['x'], 'bad.svg', { type: 'image/svg+xml' })]),
    );
    assert.equal(requests, 0);
    assert.match(attachments.error, /PNG/);
    const operation = attachments.paste([
      new window.File(['x'], 'paste.png', { type: 'image/png' }),
    ]);
    for (let i = 0; i < 40 && !requests; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    await act(async () => {
      attachments.clear();
      pending.resolve({
        ok: true,
        data: { files: [{ id: 'late-image', kind: 'image', size: 1 }] },
      });
      await operation;
    });
    assert.equal(attachments.files.length, 0);
    assert.deepEqual(discarded, ['late-image']);
  } finally {
    await env.dispose();
  }
});

test('clipboard uses the shared card and attaches only after explicit local action', async () => {
  const env = environment(),
    f = fixture(env);
  let attached = 0,
    sent = 0;
  try {
    await env.mount(env.Clipboard, {
      context: 'first',
      onSend: async () => {
        sent++;
      },
      onAttachImage: async () => {
        attached++;
        return true;
      },
    });
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'image-621' }, notification: { id: 'image-621' } },
        { id: 'image-621', contentType: 'image', imageData: 'data:image/png;base64,AQID' },
      ),
    );
    await settle();
    const card = document.querySelector('#clipboard-card .attachment-card');
    assert.ok(card);
    assert.ok(card.classList.contains('attachment-suggestion'));
    assert.ok(card.querySelector('img'));
    assert.match(card.querySelector('#clipboard-use').getAttribute('aria-label'), /Usar/);
    assert.equal(card.querySelector('.attachment-privacy'), null);
    assert.equal(card.querySelector('.attachment-info'), null);
    assert.equal(card.querySelector('.attachment-remove'), null);
    assert.equal(attached, 0);
    assert.equal(sent, 0);
    const add = card.querySelector('#clipboard-use');
    await act(async () => add.click());
    assert.equal(attached, 1);
    assert.equal(sent, 0);
    assert.equal(document.querySelector('#clipboard-card'), null);
  } finally {
    await env.dispose();
  }
});

test('dropped text file uses shared attachments, respects count and never sends a chat', async () => {
  const env = environment(),
    f = fixture(env);
  let attachments,
    imports = 0;
  window.jarvisWindow.dropFile = async ({ name, data }) => {
    imports++;
    assert.equal(name, 'notas.txt');
    return {
      ok: true,
      data: { files: [{ id: 'drop-621', name, kind: 'document', size: 5, textPreview: 'Notas' }] },
    };
  };
  function Harness() {
    attachments = env.useAttachments();
    return React.createElement(env.AttachmentList, {
      files: attachments.files,
      onRemove: attachments.remove,
    });
  }
  try {
    await env.mount(Harness);
    await act(async () =>
      attachments.paste(
        [new window.File(['Notas'], 'notas.txt', { type: 'text/plain' })],
        '',
        'drop',
      ),
    );
    assert.equal(imports, 1);
    assert.equal(attachments.files.length, 1);
    assert.ok(document.querySelector('.attachment-card'));
    assert.equal(f.calls.filter((x) => x.route === '/chat').length, 0);
    await act(async () =>
      attachments.paste(Array(5).fill(new window.File(['x'], 'notas.txt')), '', 'drop'),
    );
    assert.match(attachments.error, /5 arquivos/);
    assert.equal(imports, 1);
  } finally {
    await env.dispose();
  }
});

test('top chat menu offers all actions and canceled deletion preserves the chat', async () => {
  const env = environment(),
    f = fixture(env),
    workspace = env.createWorkspace({ api: f.transport, post: f.post });
  let attempts = 0;
  window.jarvisWindow.manageChat = async () => {
    attempts++;
    return { canceled: true };
  };
  try {
    await env.mount(env.App, { workspace });
    await act(async () => workspace.view('project-a', 'first'));
    await input('#input', 'Rascunho preservado');
    await click('#manage-open');
    const menu = document.querySelector('.workspace-action-menu');
    assert.ok(menu);
    for (const text of [
      'Editar conversa',
      'Mensagens anteriores',
      'Arquivar',
      'Limpar mensagens',
      'Excluir',
    ])
      assert.ok([...menu.querySelectorAll('button')].some((x) => x.textContent.trim() === text));
    await act(async () =>
      [...menu.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Excluir').click(),
    );
    assert.equal(attempts, 1);
    assert.equal(workspace.get().chat.id, 'first');
    assert.equal(document.getElementById('input').value, 'Rascunho preservado');
    await act(async () => document.querySelector('.workspace-action-menu button').click());
    assert.equal(document.getElementById('manage-dialog').open, true);
    assert.equal(document.getElementById('chat-title').value, 'Login');
    assert.equal(document.getElementById('input').value, 'Rascunho preservado');
  } finally {
    await env.dispose();
  }
});

test('clipboard Use locks actions while importing and never sends a chat message automatically', async () => {
  const env = environment(),
    f = fixture(env),
    pending = deferred();
  try {
    await env.mount(env.Clipboard, { context: 'first', onAttachImage: () => pending.promise });
    await act(async () =>
      f.clipboard(
        { pending: true, owned: { main: 'busy-image' }, notification: { id: 'busy-image' } },
        { id: 'busy-image', contentType: 'image', imageData: 'data:image/png;base64,aA==' },
      ),
    );
    await settle();
    await click('#clipboard-use');
    const card = document.querySelector('#clipboard-card .attachment-card');
    assert.equal(card.getAttribute('aria-busy'), 'true');
    assert.equal(
      [...card.querySelectorAll('button')].every((button) => button.disabled),
      true,
    );
    assert.equal(
      f.calls.some((row) => row.dismiss),
      false,
    );
    await act(async () => pending.resolve(true));
    await settle();
    assert.equal(document.querySelector('#clipboard-card'), null);
    assert.equal(
      f.calls.some((row) => row.route === '/chat'),
      false,
    );
  } finally {
    await env.dispose();
  }
});

test('image-only tile downloads locally without metadata or icons; Delete removes the draft attachment', async () => {
  const env = environment();
  fixture(env);
  let saved = [],
    removed = [];
  window.jarvisWindow.downloadAttachment = async (id) => {
    saved.push(id);
    return { ok: true };
  };
  try {
    await env.mount(env.AttachmentList, {
      files: [
        {
          id: 'compact',
          name: 'foto.png',
          kind: 'image',
          size: 4,
          preview: 'data:image/png;base64,AQID',
        },
      ],
      onRemove: (id) => removed.push(id),
    });
    await click('button[aria-label="Baixar foto.png"]');
    assert.deepEqual(saved, ['compact']);
    assert.deepEqual(removed, []);
    assert.equal(document.querySelector('button[aria-label="Remover foto.png"]'), null);
    await act(async () =>
      document
        .querySelector('.attachment-open')
        .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })),
    );
    assert.deepEqual(saved, ['compact']);
    assert.deepEqual(removed, ['compact']);
  } finally {
    await env.dispose();
  }
});

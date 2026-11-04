const { deferred } = require('./react.cjs');
function fixture(environment, { bootstrap, send, writerCommand } = {}) {
  const calls = [],
    clipboardListeners = new Set(),
    quickListeners = new Set();
  const project = {
    id: 'project-a',
    name: 'Projeto A',
    path: 'C:/fixtures/A',
    ready: 1,
    scope_confirmed: 1,
    state: 'ready',
    knowledge_version: 1,
    progress: 'Memória atualizada',
  };
  const chats = [
    {
      id: 'general',
      project_id: null,
      title: 'Conversa Geral (antiga)',
      slot: null,
      last_message_at: '2026-10-28T01:00:00Z',
    },
    {
      id: 'first',
      project_id: project.id,
      title: 'Login',
      last_message_at: '2026-10-28T01:00:00Z',
    },
    {
      id: 'second',
      project_id: project.id,
      title: 'Feed',
      last_message_at: '2026-10-28T01:00:00Z',
    },
    { id: 'quick', project_id: null, title: 'Quick Chat', slot: 'quick', last_message_at: '2026-10-28T01:00:00Z' },
  ];
  const histories = Object.fromEntries(
    chats.map((chat) => [chat.id, [{ id: 1, role: 'user', content: 'Contexto ' + chat.id }]]),
  );
  let clipboard = {
      pending: false,
      owned: {},
      settings: { enabled: false, paused: false, sound: false, volume: 0.25 },
    },
    notification = null;
  let quick = {
    ready: true,
    config: { voice: false, opacity: 0.82 },
    masterVoice: false,
    busy: false,
    project: null,
    answer: '',
    remaining: 3,
  };
  const document = {
    id: 'document-a',
    kind: 'document',
    title: 'Documento.docx',
    version: 1,
    parent: null,
    blocks: [{ id: 'block-a', type: 'paragraph', text: 'Texto inicial' }],
  };
  const transport = async (route, options) => {
    calls.push({ route, options });
    if (route === '/workspace/bootstrap')
      return bootstrap
        ? await bootstrap
        : { projects: [project], chats, histories: {}, general_chat_id: null, catalog_next: null };
    if (route.startsWith('/chats/catalog')) { const query = new URLSearchParams(route.split('?')[1]); const offset = Number(query.get('offset') || 0), search = (query.get('search') || '').toLowerCase(); const rows = chats.filter(c => !c.project_id && c.slot !== 'quick' && c.title.toLowerCase().includes(search)); return { chats: rows.slice(offset, offset + 30), next: rows.length > offset + 30 ? offset + 30 : null }; }
    if (route === '/workspace') return { projects: [project], chats };
    if (route === '/workspace/progress') return { projects: [project] };
    if (route === '/storage')
      return {
        local: { usedBytes: 1 },
        cloud: { usedBytes: 1, limitBytes: 52428800, blocked: false },
      };
    const body = options?.body ? JSON.parse(options.body) : {};
    if (route === '/workspace/view')
      return { project: body.project_id ? project : null, chats: [], archived_chats: [] };
    if (route.startsWith('/chats/history')) {
      const id = new URLSearchParams(route.split('?')[1]).get('chat_id');
      const before = Number(new URLSearchParams(route.split('?')[1]).get('before') || Infinity);
      return { chat: chats.find((item) => item.id === id), messages: (histories[id] || []).filter(m => m.id < before).slice(-100) };
    }
    if (route === '/chats/create') {
      const chat = {
        id: 'new-' + chats.length,
        project_id: body.project_id,
        title: 'Nova conversa',
      };
      chats.push(chat);
      histories[chat.id] = [];
      return chat;
    }
    if (route === '/chat') {
      if (send) return send(body);
      const chat = {
        ...chats.find((item) => item.id === body.chat_id),
        last_message_at: '2026-10-28T02:00:00Z',
      };
      return {
        reply: 'Resposta salva.',
        pending_actions: [],
        persisted: {
          chat,
          messages: [
            { id: 2, role: 'user', content: body.message },
            { id: 3, role: 'assistant', content: 'Resposta salva.' },
          ],
        },
      };
    }
    if (route === '/projects/selection/size')
      return { selected_bytes: 1024, max_bytes: 5242880, within_limit: true };
    if (route.startsWith('/projects/selection?'))
      return {
        selection: { confirmed: true, include: ['.'], exclude: [] },
        entries: [
          { path: 'source', name: 'source', type: 'directory' },
          { path: '.env', name: '.env', type: 'file', disabled: true, reason: 'Segredo bloqueado' },
        ],
        next_offset: null,
      };
    if (route === '/projects/selection/save') return project;
    if (route === '/speak') return { audio_base64: 'bXAz' };
    if (route === '/chats/settings') {
      Object.assign(
        chats.find((item) => item.id === body.chat_id),
        body,
      );
      return {};
    }
    if (route === '/action/confirm') return { result: 'Ação processada.' };
    throw Error('Unexpected test route ' + route);
  };
  window.jarvisWindow = {
    api: async (route, options) => ({ ok: true, data: await transport(route, options) }),
    initialSettings: async () => ({ voice: false, theme: 'dark' }),
    voicePreference: async () => {},
    onStopAudio: () => () => {},
    onWorkspaceChanged: () => () => {},
    onOpenChat: () => () => {},
    copyCode: async (text) => {
      calls.push({ copy: text });
    },
    openLink: async (url) => {
      calls.push({ link: url });
    },
    claimAudio: async () => {},
    cancelChat: async () => {},
    quickSettings: async () => quick.config,
    configureQuick: async () => {},
    clearStorage: async () => ({ canceled: true }),
    chooseAttachments: async () => ({ canceled: true }),
    discardAttachment: async () => {},
    saveAttachment: async () => ({ ok: true }),
    attachmentInfo: async () => ({ ok: true, data: {} }),
    minimize() {},
    close() {},
    manageChat: async (id, action) => {
      calls.push({ manage: id, action });
      return { ok: true };
    },
    authorizeFolder: async () => ({ canceled: true }),
  };
  window.jarvisAuth = {
    state: async () => ({}),
    login: async (value) => calls.push({ login: value }),
    logout: async () => {},
  };
  window.jarvisWriter = {
    dirty: async () => {},
    cancel: async () => {},
    file: async () => ({ ok: true, data: { linked: false } }),
    export: async (value) => ({ ok: true }),
    command: async (value) => {
      calls.push({ writer: value });
      if (writerCommand) return writerCommand(value);
      const { action, payload } = value;
      const data =
        action === 'open'
          ? {
              nodes: [document],
              settings: {
                cloud_consent: true,
                auto_write: false,
                linguistic: false,
                style: 'neutro',
                cancel_seconds: 5,
                retention: 10,
                width: 'normal',
              },
            }
          : action === 'get'
            ? structuredClone(document)
            : action === 'messages'
              ? []
              : action === 'save'
                ? { version: payload.base_version + 1 }
                : action === 'assist'
                  ? { reply: 'Resposta Writer.', proposal: null }
                  : {};
      return { ok: true, data };
    },
  };
  window.jarvisSpotify = {
    request: async (input) => {
      calls.push({ spotify: input });
      return { status: 'disconnected', configured: true };
    },
    onChanged: () => () => {},
  };
  window.jarvisClipboard = {
    state: async () => clipboard,
    onState: (fn) => {
      clipboardListeners.add(fn);
      return () => clipboardListeners.delete(fn);
    },
    onSound: () => () => {},
    claim: async () => {
      calls.push({ claim: true });
      return notification ? { ok: true, notification } : { ok: false };
    },
    dismiss: async (id) => {
      calls.push({ dismiss: id });
      clipboard = { ...clipboard, owned: {} };
    },
    discard: async () => {},
    configure: async (settings) => {
      clipboard = { ...clipboard, settings: { ...clipboard.settings, ...settings } };
      return clipboard;
    },
    openLink: async (id) => {
      calls.push({ clipboardLink: id });
      return true;
    },
  };
  window.quick = {
    state: async () => quick,
    onState: (fn) => {
      quickListeners.add(fn);
      return () => quickListeners.delete(fn);
    },
    onFocus: () => () => {},
    onStopAudio: () => () => {},
    onAudio: () => () => {},
    pause: async () => {},
    resize: async () => {},
    resizeInput: async () => {},
    voice: async () => {},
    copy: async () => {},
    openMain: async () => {},
    stop: async () => {},
    speak: async () => {},
    pin: async () => {},
    hide: async () => {},
    collapse: async () => {},
    toggle: async () => {},
    move: async () => {},
    send: async (text, useProject) => {
      calls.push({ quick: text, useProject });
      return { ok: true };
    },
  };
  return {
    project,
    chats,
    histories,
    calls,
    transport,
    post: (route, body) => transport(route, { method: 'POST', body: JSON.stringify(body) }),
    document,
    clipboard(value, item) {
      clipboard = value;
      notification = item;
      for (const listener of clipboardListeners) listener(value);
    },
    quick(value) {
      quick = { ...quick, ...value };
      for (const listener of quickListeners) listener(quick);
    },
    listeners: () => ({ clipboard: clipboardListeners.size, quick: quickListeners.size }),
  };
}
module.exports = { fixture };

import {
  api as defaultApi,
  post as defaultPost,
  createStore,
  readPreference,
  writePreference,
} from '../shared/bridge';

const revision = (chat) =>
  JSON.stringify([chat?.last_message_at, chat?.archived, chat?.writer_document_id]);
export function createWorkspace({ api = defaultApi, post = defaultPost } = {}) {
  const store = createStore({
    ready: false,
    loading: false,
    busy: false,
    projects: [],
    chats: [],
    project: null,
    chat: null,
    messages: [],
    visible: 100,
    status: 'Carregando suas informações e histórico...',
    error: '',
    storage: null,
    pendingActions: [],
    settings: {},
  });
  const cache = new Map();
  let initialization,
    initializationId = 0,
    generation = 0,
    disposed = false,
    refreshPromise,
    refreshQueued = false,
    pollFailures = 0,
    nextPoll = 0,
    lastSync = 0,
    sending = false;
  const assertActive = (epoch) => !disposed && epoch === generation;
  const cacheEntry = (chat, messages, complete = false) => ({
    revision: revision(chat),
    messages,
    complete,
  });
  const selection = (project, chat) =>
    writePreference('jarvis.selection', { project: project?.id || '', chat: chat?.id || null });
  const updateCatalog = (chats) => {
    for (const [id, entry] of cache)
      if (!chats.some((chat) => chat.id === id && revision(chat) === entry.revision))
        cache.delete(id);
    store.set({ chats });
  };
  async function history(chat, epoch) {
    let entry = cache.get(chat.id);
    if (!entry || entry.revision !== revision(chat)) {
      const response = await api('/chats/history?chat_id=' + encodeURIComponent(chat.id));
      if (!assertActive(epoch)) return null;
      chat = { ...response.chat, ...chat };
      entry = cacheEntry(chat, response.messages);
      cache.set(chat.id, entry);
    }
    return { chat, messages: entry.messages };
  }
  async function view(
    projectId = '',
    chatId = null,
    { initializing = false, internal = false } = {},
  ) {
    const before = store.get();
    if (
      disposed ||
      before.busy ||
      (!initializing && !before.ready) ||
      (before.loading && !initializing && !internal)
    )
      return false;
    const epoch = ++generation;
    store.set({ loading: true, error: '', visible: 100 });
    try {
      const result = await post('/workspace/view', {
        project_id: projectId || null,
        include_chats: false,
      });
      if (!assertActive(epoch)) return false;
      const chat = store
        .get()
        .chats.find((item) => item.id === chatId && (item.project_id || '') === projectId);
      const selected = chat ? await history(chat, epoch) : { chat: null, messages: [] };
      if (!selected || !assertActive(epoch)) return false;
      store.set({
        project: result.project,
        ...selected,
        status: result.project && !result.project.ready ? result.project.progress : 'Conectado',
      });
      selection(result.project, selected.chat);
      return true;
    } finally {
      if (assertActive(epoch)) store.set({ loading: false });
    }
  }
  async function initialize() {
    if (initialization) return initialization;
    disposed = false;
    const id = ++initializationId;
    const currentInitialization = () => !disposed && id === initializationId;
    store.set({
      ready: false,
      loading: false,
      projects: [],
      chats: [],
      project: null,
      chat: null,
      messages: [],
      storage: null,
      error: '',
      status: 'Carregando suas informações e histórico...',
    });
    initialization = (async () => {
      const [snapshot, storage, settings] = await Promise.all([
        api('/workspace/bootstrap'),
        api('/storage'),
        window.jarvisWindow.initialSettings?.() || Promise.resolve({}),
      ]);
      if (!currentInitialization()) return;
      if (storage.cloudError) throw new Error(storage.cloudError);
      cache.clear();
      for (const chat of snapshot.chats)
        cache.set(chat.id, cacheEntry(chat, snapshot.histories[chat.id] || [], true));
      store.set({ projects: snapshot.projects, chats: snapshot.chats, storage, settings });
      const saved = readPreference('jarvis.selection', {});
      const projectId = snapshot.projects.some((item) => item.id === saved.project)
        ? saved.project
        : '';
      await view(projectId, saved.chat, { initializing: true });
      if (currentInitialization()) await window.jarvisWindow.workspaceReady?.();
      if (currentInitialization()) {
        lastSync = Date.now();
        store.set({ ready: true, status: 'Conectado' });
      }
    })().catch((error) => {
      if (currentInitialization()) initialization = null;
      if (currentInitialization())
        store.set({
          ready: false,
          loading: false,
          error: error.message,
          status: 'Falha ao carregar seus dados',
        });
      throw error;
    });
    return initialization;
  }
  async function refresh(force = true) {
    if (disposed || !store.get().ready || document.visibilityState === 'hidden') return;
    if (!force && (pollFailures >= 5 || Date.now() < nextPoll)) return;
    if (store.get().busy || store.get().loading) {
      refreshQueued ||= force;
      return;
    }
    if (refreshPromise) return refreshPromise;
    const indexing = ['queued', 'indexing'].includes(store.get().project?.state);
    const remote = force || Date.now() - lastSync >= 300000;
    if (!remote && !indexing) return;
    refreshPromise = (async () => {
      const epoch = generation;
      const result = await api(remote ? '/workspace' : '/workspace/progress');
      if (!assertActive(epoch)) return;
      pollFailures = 0;
      nextPoll = 0;
      if (remote) lastSync = Date.now();
      const current = store.get();
      store.set({
        projects: result.projects,
        project: current.project
          ? result.projects.find((item) => item.id === current.project.id) || null
          : null,
      });
      if (result.chats) {
        updateCatalog(result.chats);
        if (current.chat) {
          const metadata = result.chats.find((item) => item.id === current.chat.id);
          if (!metadata || metadata.archived) store.set({ chat: null, messages: [] });
          else if (revision(metadata) !== revision(current.chat)) {
            const selected = await history(metadata, epoch);
            if (selected && assertActive(epoch)) store.set(selected);
          }
        }
      }
    })()
      .catch((error) => {
        pollFailures = Math.min(pollFailures + 1, 5);
        nextPoll = Date.now() + 2000 * 2 ** pollFailures;
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }
  async function catalog(projectId = store.get().project?.id || '', chatId = store.get().chat?.id) {
    const result = await api('/workspace');
    store.set({ projects: result.projects });
    updateCatalog(result.chats);
    lastSync = Date.now();
    return view(projectId, chatId);
  }
  async function newChat(projectId = store.get().project?.id || '') {
    if (disposed || !store.get().ready || store.get().busy || store.get().loading) return;
    const epoch = ++generation;
    store.set({ loading: true });
    try {
      const chat = await post('/chats/create', {
        project_id: projectId || null,
        title: 'Nova conversa',
      });
      if (!assertActive(epoch)) return;
      if ((chat.project_id || '') !== projectId)
        throw Error('A conversa criada pertence a outro projeto.');
      store.set({ chats: [chat, ...store.get().chats.filter((item) => item.id !== chat.id)] });
      cache.set(chat.id, cacheEntry(chat, [], true));
      await view(projectId, chat.id, { internal: true });
      return chat;
    } finally {
      if (assertActive(epoch)) store.set({ loading: false });
    }
  }
  const canSend = () => {
    const s = store.get();
    return (
      !disposed &&
      s.ready &&
      !s.busy &&
      !s.loading &&
      !s.chat?.archived &&
      !s.storage?.cloud?.blocked &&
      !(
        s.project &&
        !s.chat?.writer_document_id &&
        (!s.project.ready || s.project.scope_confirmed === 0)
      )
    );
  };
  async function send(text, attachments = []) {
    if (sending || !canSend() || (!text.trim() && !attachments.length) || text.length > 6000)
      return false;
    sending = true;
    try {
      const s = store.get();
      const contextEpoch = generation;
      store.set({ loading: true });
      try {
        if (s.project) {
          const size = await post('/projects/selection/size', { project_id: s.project.id });
          if (!Number.isFinite(size.selected_bytes) || !Number.isFinite(size.max_bytes))
            throw Error('Não foi possível conferir o tamanho dos arquivos.');
          if (!size.within_limit || size.selected_bytes > size.max_bytes)
            throw Error('O projeto ultrapassa 5 MB. Revise os arquivos selecionados.');
        }
        if (!assertActive(contextEpoch)) return false;
        if (
          (store.get().project?.id || '') !== (s.project?.id || '') ||
          (store.get().chat?.id || '') !== (s.chat?.id || '')
        )
          throw Error('O contexto mudou. Revise a conversa antes de enviar.');
      } finally {
        if (assertActive(contextEpoch)) store.set({ loading: false });
      }
      if (!s.chat) await newChat();
      if (!canSend() || !store.get().chat) return false;
      const chat = store.get().chat,
        previous = cache.get(chat.id);
      const historyBefore = store.get().messages.filter((message) => !message.temporary);
      const question = text.trim() || 'Analise os anexos.';
      store.set({
        busy: true,
        error: '',
        status: 'Cyro está pensando...',
        messages: [
          ...store.get().messages,
          { role: 'user', content: question, attachments, temporary: true },
        ],
        pendingActions: [],
      });
      try {
        const result = await post('/chat', {
          message: question,
          mode: chat.project_id ? 'programming' : 'chat',
          chat_id: chat.id,
          ...(attachments.length ? { attachments: attachments.map((item) => item.id) } : {}),
        });
        if (disposed) return false;
        if (result.persisted?.chat && Array.isArray(result.persisted.messages)) {
          const saved = { ...chat, ...result.persisted.chat };
          const entry = cacheEntry(
            saved,
            [...(previous?.messages || historyBefore), ...result.persisted.messages],
            previous?.complete,
          );
          cache.set(chat.id, entry);
          store.set({
            chat: saved,
            chats: store.get().chats.map((item) => (item.id === chat.id ? saved : item)),
            messages: entry.messages,
          });
        } else {
          cache.delete(chat.id);
          store.set({
            messages: [
              ...historyBefore,
              { role: 'user', content: question, attachments },
              { role: 'assistant', content: result.reply },
            ],
          });
        }
        store.set({ status: 'Pronto', pendingActions: result.pending_actions || [] });
        return result;
      } catch (error) {
        cache.delete(chat.id);
        store.set({ error: error.message, status: 'Falha' });
        throw error;
      } finally {
        store.set({ busy: false });
        if (refreshQueued) {
          refreshQueued = false;
          void refresh().catch(() => {});
        }
      }
    } finally {
      sending = false;
    }
  }
  async function older() {
    const s = store.get();
    if (!s.chat || s.busy || s.loading) return;
    const entry = cache.get(s.chat.id);
    if (s.visible < s.messages.length) {
      store.set({ visible: s.visible + 100 });
      return;
    }
    if (entry?.complete) return;
    const result = await api(
      '/chats/history?chat_id=' + encodeURIComponent(s.chat.id) + '&before=' + s.messages[0]?.id,
    );
    const messages = [...result.messages, ...s.messages];
    cache.set(s.chat.id, cacheEntry(s.chat, messages, result.messages.length < 100));
    store.set({ messages, visible: s.visible + 100 });
  }
  return {
    ...store,
    initialize,
    view,
    refresh,
    catalog,
    newChat,
    canSend,
    send,
    older,
    async openById(id) {
      await catalog();
      const chat = store.get().chats.find((item) => item.id === id);
      if (!chat) throw Error('Conversa indisponível.');
      cache.delete(id);
      return view(chat.project_id || '', id);
    },
    async cancel() {
      await window.jarvisWindow.cancelChat();
    },
    async storage() {
      const storage = await api('/storage');
      store.set({ storage });
      return storage;
    },
    dispose() {
      disposed = true;
      initializationId++;
      generation++;
      cache.clear();
      initialization = null;
      store.set({
        ready: false,
        loading: false,
        busy: false,
        project: null,
        chat: null,
        messages: [],
        projects: [],
        chats: [],
        storage: null,
        pendingActions: [],
        settings: {},
      });
    },
  };
}

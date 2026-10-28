import { createStore } from '../shared/bridge';
export function createWriter(bridge = window.jarvisWriter) {
  const store = createStore({
    project: null,
    chat: null,
    catalog: null,
    document: null,
    proposal: null,
    messages: [],
    editing: false,
    busy: false,
    loading: false,
    dirty: false,
    saving: false,
    error: '',
    status: '',
    selectedIds: [],
    selectedText: '',
    file: null,
    remaining: 0,
  });
  let version = 0,
    savedVersion = 0,
    saving = null,
    autoTimer = null,
    saveTimer = null,
    epoch = 0;
  const dirty = () => {
    const value = version !== savedVersion || store.get().proposal?.state === 'PENDING';
    store.set({ dirty: value });
    void bridge.dirty(value).catch(() => {});
  };
  async function command(action, payload = {}, projectId = store.get().project?.id) {
    if (!projectId) throw Error('Abra um projeto para usar o Writer.');
    const result = await bridge.command({ project_id: projectId, action, payload });
    if (!result.ok)
      throw Error(result.data?.detail || 'Não foi possível concluir a operação Writer.');
    return result.data;
  }
  const stopAuto = () => {
    clearInterval(autoTimer);
    autoTimer = null;
    store.set({ remaining: 0 });
  };
  async function syncFile() {
    const state = store.get();
    if (!bridge.file || !state.document) return;
    const result = await bridge.file({
      project_id: state.project.id,
      action: 'sync',
      id: state.document.id,
    });
    if (!result.ok)
      throw Error(
        result.data?.detail ||
          'Texto salvo no Cyro, mas o arquivo original não foi atualizado. Exporte uma cópia para recuperar.',
      );
    store.set({
      file: result.data,
      status: result.data.linked ? 'Arquivo original atualizado.' : 'Salvo no Cyro.',
    });
  }
  async function flush() {
    clearTimeout(saveTimer);
    if (saving) await saving;
    if (version === savedVersion) return;
    const projectId = store.get().project.id,
      id = store.get().document.id;
    store.set({ saving: true, error: '' });
    saving = (async () => {
      while (version !== savedVersion) {
        const current = version,
          document = store.get().document,
          blocks = structuredClone(document.blocks);
        const result = await command(
          'save',
          { id, base_version: document.version, blocks, request_id: crypto.randomUUID() },
          projectId,
        );
        if (store.get().document?.id !== id) throw Error('Documento mudou durante o salvamento.');
        savedVersion = current;
        store.set({ document: { ...store.get().document, version: result.version } });
      }
      dirty();
      store.set({ status: 'Salvo no Cyro.' });
    })()
      .catch((error) => {
        store.set({ error: error.message + ' Sua edição permanece aberta para recuperação.' });
        throw error;
      })
      .finally(() => {
        saving = null;
        store.set({ saving: false });
      });
    return saving;
  }
  async function messages() {
    const values = await command('messages', { id: store.get().document?.id || null });
    const pending = values.findLast((item) => item.proposal_state?.state === 'PENDING');
    const proposal = pending ? await command('proposal', { id: pending.proposal_state.id }) : null;
    store.set({ messages: values, proposal });
    dirty();
  }
  async function load(project, chat) {
    await flush();
    stopAuto();
    const current = ++epoch;
    if (store.get().busy && store.get().project) await bridge.cancel(store.get().project.id);
    store.set({
      project,
      chat,
      loading: true,
      error: '',
      selectedIds: [],
      selectedText: '',
      editing: false,
      proposal: null,
    });
    try {
      const [catalog, document] = await Promise.all([
        command('open', {}, project.id),
        command('get', { id: chat.writer_document_id, include_removed: true }, project.id),
      ]);
      if (current !== epoch) return;
      version = savedVersion = 0;
      store.set({ catalog, document });
      if (bridge.file) {
        const result = await bridge.file({
          project_id: project.id,
          action: 'info',
          id: document.id,
        });
        if (!result.ok) throw Error(result.data?.detail || 'Não foi possível verificar o arquivo.');
        store.set({ file: result.data });
      }
      await messages();
    } catch (error) {
      store.set({ error: error.message });
      throw error;
    } finally {
      if (current === epoch) store.set({ loading: false });
    }
  }
  function edit(blocks) {
    if (!store.get().editing || store.get().busy || store.get().chat?.archived) return;
    version++;
    store.set({ document: { ...store.get().document, blocks }, selectedIds: [], selectedText: '' });
    dirty();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush().catch(() => {}), 350);
  }
  async function decide(approve, automatic = false, edited_blocks = null) {
    stopAuto();
    await flush();
    const proposal = store.get().proposal;
    if (!proposal) return;
    const result = await command('decide', { id: proposal.id, approve, automatic, edited_blocks });
    if (result.state === 'CONFLICTED') {
      store.set({ proposal: { ...proposal, state: result.state }, error: result.message });
      dirty();
      return result;
    }
    if (approve && result.state === 'APPLIED') {
      const document = await command('get', { id: store.get().document.id, include_removed: true });
      store.set({ document });
      await syncFile();
    }
    store.set({
      proposal: null,
      status: approve
        ? 'Alteração salva. Use Desfazer para recuperar a versão anterior.'
        : 'Proposta rejeitada.',
      selectedIds: [],
      selectedText: '',
    });
    await messages();
    dirty();
    return result;
  }
  async function send(text) {
    const initial = store.get();
    if (
      !text.trim() ||
      text.length > 6000 ||
      initial.busy ||
      initial.loading ||
      initial.chat?.archived ||
      !initial.document
    )
      return false;
    store.set({ busy: true, error: '' });
    const preflightEpoch = epoch;
    try {
      await flush();
      if (preflightEpoch !== epoch || store.get().document?.id !== initial.document.id)
        return false;
      if (store.get().proposal?.state === 'PENDING') {
        const result = await decide(true);
        if (result?.state === 'CONFLICTED')
          throw Error('Resolva o conflito da proposta anterior antes de enviar.');
      }
      if (store.get().document.deleted) throw Error('Escolha um documento ativo para continuar.');
      const current = epoch,
        document = store.get().document;
      store.set({
        busy: true,
        error: '',
        status: 'Consultando IA Cloud…',
        messages: [...store.get().messages, { role: 'user', content: text }],
      });
      try {
        const result = await command('assist', {
          chat_id: store.get().chat.id,
          request_id: crypto.randomUUID(),
          message: text,
          document_id: document.id,
          base_version: document.version,
          selected_block_ids: store.get().selectedIds,
          selected_text: store.get().selectedText,
          intent_override: null,
        });
        if (current !== epoch) return false;
        store.set({
          messages: [
            ...store.get().messages,
            { role: 'assistant', content: result.reply, context_notice: result.context_notice },
          ],
          proposal: result.proposal,
          editing: result.proposal ? false : store.get().editing,
          status: 'Pronto',
        });
        dirty();
        if (result.proposal?.auto && result.proposal.state === 'PENDING') {
          store.set({ remaining: result.cancel_seconds });
          autoTimer = setInterval(() => {
            const remaining = store.get().remaining - 1;
            store.set({ remaining });
            if (remaining <= 0) {
              stopAuto();
              void decide(true, true).catch((error) => store.set({ error: error.message }));
            }
          }, 1000);
        }
        return result;
      } catch (error) {
        store.set({ error: error.message, status: 'Falha' });
        throw error;
      } finally {
        store.set({ busy: false });
      }
    } finally {
      store.set({ busy: false });
    }
  }
  async function structure(operation, extra = {}) {
    await flush();
    stopAuto();
    const document = store.get().document;
    const proposal = await command('structure', {
      id: document.id,
      base_version: document.version,
      plan: { operation, targetDocumentId: document.id, ...extra },
    });
    store.set({ proposal, status: 'Organização proposta; revise antes de aprovar.' });
    dirty();
  }
  return {
    ...store,
    command,
    load,
    flush,
    edit,
    decide,
    send,
    structure,
    syncFile,
    select(ids, text) {
      store.set({ selectedIds: ids, selectedText: text.slice(0, 2000) });
    },
    async toggleEdit() {
      stopAuto();
      await flush();
      store.set({ editing: !store.get().editing });
    },
    async reload() {
      const document = await command('get', { id: store.get().document.id, include_removed: true });
      store.set({ document, error: '', selectedIds: [], selectedText: '' });
      await messages();
    },
    async cancel() {
      stopAuto();
      await bridge.cancel(store.get().project.id);
    },
    async undo(action) {
      await flush();
      stopAuto();
      const document = store.get().document;
      await command(action, { id: document.id, base_version: document.version });
      store.set({
        document: await command('get', { id: document.id, include_removed: true }),
        proposal: null,
      });
      await syncFile();
      await messages();
    },
    async leave() {
      await flush();
      stopAuto();
      if (store.get().busy) await bridge.cancel(store.get().project.id);
      epoch++;
      store.set({
        project: null,
        chat: null,
        document: null,
        proposal: null,
        messages: [],
        dirty: false,
      });
      await bridge.dirty(false);
    },
    dispose() {
      stopAuto();
      clearTimeout(saveTimer);
      epoch++;
    },
  };
}

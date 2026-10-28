import { createStore, preferenceStorage } from '../shared/bridge';
export function createWriter(bridge = window.jarvisWriter) {
  const store = createStore({
    project: null,
    chat: null,
    catalog: null,
    document: null,
    proposal: null,
    messages: [],
    busy: false,
    loading: false,
    dirty: false,
    unsynced: false,
    saving: false,
    error: '',
    status: '',
    selectedIds: [],
    selectedText: '',
    file: null,
  });
  let version = 0,
    savedVersion = 0,
    saving = null,
    saveTimer = null,
    epoch = 0,
    editorAdapter = null,
    selectionRange = null,
    recoveryTimer = null,
    pendingSave = null;
  const recoveryKey = () =>
    'cyro.writer.recovery.' + store.get().project?.id + '.' + store.get().document?.id;
  const preserve = () => {
    try {
      if (version !== savedVersion && store.get().document)
        preferenceStorage().setItem(
          recoveryKey(),
          JSON.stringify({
            base: store.get().document.version,
            blocks: store.get().document.blocks,
          }),
        );
    } catch {
      store.set({
        error:
          'Não foi possível gravar a recuperação local. Mantenha esta janela aberta e exporte uma cópia.',
      });
    }
  };
  const dirty = () => {
    const unsynced = version !== savedVersion;
    const value = unsynced || store.get().proposal?.state === 'PENDING';
    if (store.get().dirty !== value || store.get().unsynced !== unsynced) {
      store.set({ dirty: value, unsynced });
      void bridge.dirty(value).catch(() => {});
    }
  };
  async function command(action, payload = {}, projectId = store.get().project?.id) {
    if (!projectId) throw Error('Abra um projeto para usar o Writer.');
    const result = await bridge.command({ project_id: projectId, action, payload });
    if (!result.ok)
      throw Error(result.data?.detail || 'Não foi possível concluir a operação Writer.');
    return result.data;
  }
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
  async function flush(force = true) {
    clearTimeout(saveTimer);
    if (saving) await saving;
    if (version === savedVersion) return;
    const projectId = store.get().project.id,
      id = store.get().document.id;
    store.set({ saving: true, error: '' });
    saving = (async () => {
      while (version !== savedVersion) {
        const document = store.get().document;
        if (!pendingSave)
          pendingSave = {
            editVersion: version,
            payload: {
              id,
              base_version: document.version,
              blocks: structuredClone(document.blocks),
              request_id: crypto.randomUUID(),
            },
          };
        const current = pendingSave.editVersion;
        const result = await command('save', pendingSave.payload, projectId);
        pendingSave = null;
        if (store.get().document?.id !== id) throw Error('Documento mudou durante o salvamento.');
        savedVersion = current;
        store.set({ document: { ...store.get().document, version: result.version } });
        if (!force && version !== savedVersion) {
          saveTimer = setTimeout(() => void flush(false).catch(() => {}), 1500);
          break;
        }
      }
      dirty();
      if (version === savedVersion) {
        clearTimeout(recoveryTimer);
        try {
          preferenceStorage().removeItem(recoveryKey());
        } catch {}
      }
      store.set({ status: version === savedVersion ? 'Salvo no Cyro.' : 'Alterações pendentes' });
    })()
      .catch((error) => {
        preserve();
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
    selectionRange = null;
    const current = ++epoch;
    if (store.get().busy && store.get().project) await bridge.cancel(store.get().project.id);
    store.set({
      project,
      chat,
      loading: true,
      error: '',
      selectedIds: [],
      selectedText: '',
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
      try {
        const recovered = JSON.parse(preferenceStorage().getItem(recoveryKey()) || 'null');
        if (recovered?.blocks) {
          document.blocks = recovered.blocks;
          version++;
          store.set({
            document: { ...document },
            status: 'Edição não sincronizada recuperada.',
            error:
              recovered.base !== document.version
                ? 'A versão salva mudou. Exporte sua edição antes de comparar ou recarregar.'
                : '',
          });
          if (recovered.base !== document.version) document.version = recovered.base;
          dirty();
        }
      } catch {}
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
    if (!store.get().document || store.get().applying || store.get().chat?.archived) return;
    version++;
    store.get().document.blocks = blocks;
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(preserve, 400);
    dirty();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush(false).catch(() => {}), 1500);
  }
  async function decide(approve, automatic = false, edited_blocks = null) {
    await flush();
    const proposal = store.get().proposal;
    if (!proposal) return;
    store.set({ applying: true });
    try {
      const result = await command('decide', {
        id: proposal.id,
        approve,
        automatic,
        edited_blocks,
      });
      if (result.state === 'CONFLICTED') {
        store.set({ proposal: { ...proposal, state: result.state }, error: result.message });
        dirty();
        return result;
      }
      if (approve && result.state === 'APPLIED') {
        const document = await command('get', {
          id: store.get().document.id,
          include_removed: true,
        });
        editorAdapter?.apply(document.blocks, 'ai');
        store.set({ document });
        await syncFile();
      }
      selectionRange = null;
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
    } finally {
      store.set({ applying: false });
    }
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
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[.!]+$/, '');
    const historyMatch = normalized.match(
      /^(?:(?:cyro|por favor)[, ]+)?(desfazer|desfaca|refazer|refaca|volte)(?: (?:a |sua )?(?:ultima (?:alteracao|edicao)(?: (?:do|pelo) cyro)?|o que foi desfeito|para a versao anterior))?$/,
    );
    const historyAction = historyMatch ? (/^ref/.test(historyMatch[1]) ? 'redo' : 'undo') : null;
    if (historyAction) {
      store.set({ busy: true, error: '' });
      try {
        let reply;
        if (editorAdapter) {
          reply = editorAdapter.control(
            historyAction,
            /sua|cyro|pelo/.test(normalized.replace(/^cyro[, ]+/, '')),
          );
          await flush();
        } else {
          await flush();
          const doc = store.get().document;
          await command(historyAction, { id: doc.id, base_version: doc.version });
          store.set({ document: await command('get', { id: doc.id }) });
          reply = historyAction === 'undo' ? 'Última edição desfeita.' : 'Última edição refeita.';
        }
        selectionRange = null;
        store.set({ selectedIds: [], selectedText: '' });
        const doc = store.get().document;
        await command('control', {
          id: doc.id,
          chat_id: store.get().chat.id,
          message: text,
          reply,
          request_id: crypto.randomUUID(),
        });
        store.set({
          messages: [
            ...store.get().messages,
            { role: 'user', content: text },
            { role: 'assistant', content: reply },
          ],
          status: reply,
        });
        return { reply };
      } finally {
        store.set({ busy: false });
      }
    }
    if (store.get().proposal?.state === 'PENDING') {
      if (/^(?:aplicar|aprovar|confirmar)(?: (?:a )?(?:alteracao|proposta))?$/.test(normalized)) {
        await decide(true);
        return { reply: 'Alteração aprovada.' };
      }
      if (/^(?:rejeitar|descartar|cancelar)(?: (?:a )?proposta)?$/.test(normalized)) {
        await decide(false);
        return { reply: 'Proposta descartada.' };
      }
      throw Error(
        'Há uma proposta pendente. Revise e aprove ou descarte pelo chat antes de continuar.',
      );
    }
    store.set({ busy: true, error: '' });
    const preflightEpoch = epoch;
    try {
      await flush();
      if (preflightEpoch !== epoch || store.get().document?.id !== initial.document.id)
        return false;
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
          continuous: true,
          selection: Array.isArray(selectionRange) ? null : selectionRange,
          selections: Array.isArray(selectionRange) ? selectionRange : [],
        });
        if (current !== epoch) return false;
        store.set({
          messages: [
            ...store.get().messages,
            { role: 'assistant', content: result.reply, context_notice: result.context_notice },
          ],
          proposal: result.proposal,
          status: 'Pronto',
        });
        dirty();
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
  return {
    ...store,
    bindEditor(adapter) {
      editorAdapter = adapter;
    },
    preserve,
    command,
    load,
    flush,
    edit,
    decide,
    send,
    syncFile,
    select(ids, text, range = null) {
      selectionRange = range;
      const current = store.get(),
        value = text.slice(0, 2000);
      if (
        current.selectedText === value &&
        current.selectedIds.length === ids.length &&
        current.selectedIds.every((id, index) => id === ids[index])
      )
        return;
      store.set({ selectedIds: ids, selectedText: value });
    },
    async reload() {
      store.set({ applying: true });
      try {
        const document = await command('get', {
          id: store.get().document.id,
          include_removed: true,
        });
        clearTimeout(saveTimer);
        clearTimeout(recoveryTimer);
        version = savedVersion = 0;
        pendingSave = null;
        try {
          preferenceStorage().removeItem(recoveryKey());
        } catch {}
        editorAdapter?.apply(document.blocks);
        selectionRange = null;
        store.set({ document, error: '', selectedIds: [], selectedText: '' });
        await messages();
      } finally {
        store.set({ applying: false });
      }
    },
    async cancel() {
      await bridge.cancel(store.get().project.id);
    },
    async leave() {
      await flush();
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
      preserve();
      clearTimeout(recoveryTimer);
      editorAdapter = null;
      clearTimeout(saveTimer);
      epoch++;
    },
  };
}

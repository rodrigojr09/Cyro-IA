// Sidebar e contexto por IDs; a propriedade de cada conversa continua validada no backend.
window.jarvisWorkspace = (() => {
  let project = null,
    chat = null,
    projects = [],
    chats = [],
    allChats = [],
    olderThan = null,
    loading = false,
    busy = false,
    initialising = null;
  const historyCache = new Map();
  let lastCatalogSync = Date.now(),
    pollInFlight = null,
    pollTimer = null,
    pollFailures = 0,
    refreshRequested = false;
  const revision = (item) =>
    JSON.stringify([item?.last_message_at, item?.archived, item?.writer_document_id]);
  const expanded = new Set(),
    el = (id) => document.getElementById(id);
  const post = (route, body) => api(route, { method: 'POST', body: JSON.stringify(body) });
  const ui = () => window.jarvisUI;
  function controls() {
    el('send').disabled =
      !!window.jarvisStorageUsage?.blocked ||
      busy ||
      loading ||
      !!chat?.archived ||
      !!(project && !chat?.writer_document_id && (!project.ready || project.scope_confirmed === 0));
    (el('new-general-chat') || el('new-chat')).disabled =
      !!window.jarvisStorageUsage?.blocked || busy || loading;
    el('add-project').disabled = busy || loading;
    el('accept-partial').hidden = !(
      project &&
      !project.ready &&
      project.knowledge_version > 0 &&
      project.state === 'partial'
    );
    const states = {
      selecting: 'Escolha os arquivos para análise',
      empty: 'Seleção sem arquivos elegíveis',
      ready: 'Memória atualizada',
      partial: 'Análise parcial',
      queued: 'Análise na fila',
      indexing: 'Analisando projeto',
      unavailable: 'Pasta indisponível',
      interrupted: 'Análise interrompida',
    };
    const stateLabel = project ? states[project.state] || project.state : '';
    el('memory-state').textContent =
      project?.progress && project.progress !== stateLabel
        ? `${stateLabel} · ${project.progress}`
        : stateLabel;
    el('memory-state').title = project
      ? `${project.tokens || 0} tokens registrados · Base v${project.knowledge_version}`
      : '';
    el('project-name').textContent = project ? project.name : 'Conversas gerais';
    el('conversation-name').textContent =
      chat?.title || (project ? 'Visão geral do projeto' : 'Nova conversa');
    el('project-banner').hidden = !project;
    el('refresh-memory').disabled =
      !project || project.scope_confirmed === 0 || ['queued', 'indexing'].includes(project.state);
    el('select-sources').disabled =
      busy || loading || !project || ['queued', 'indexing'].includes(project.state);
    el('remove-project').disabled =
      busy || loading || !project || ['queued', 'indexing'].includes(project.state);
    el('show-knowledge').disabled = !project || !project.knowledge_version;
    el('save-note').disabled = busy || loading || !project || !project.ready;
    for (const id of ['rename-chat', 'archive-chat', 'delete-chat', 'older-messages'])
      el(id).disabled = !chat || loading || busy;
    if (chat?.writer_document_id) el('older-messages').disabled = true;
    if (chat?.slot) {
      el('archive-chat').disabled = true;
      el('delete-chat').disabled = true;
    }
    el('programming-mode').disabled = !!project || busy;
    el('programming-mode').checked = !!project;
    el('programming-mode').onchange?.();
    el('manage-open').disabled = busy || loading || (!chat && !project);
    renderNavigation();
    window.dispatchEvent?.(new Event('jarvis:chat-selected'));
  }
  function button(text, kind, action, title) {
    const item = document.createElement('button');
    item.className = 'nav-item ' + kind;
    item.title = title || text;
    if (kind.split(' ').includes('active')) item.setAttribute?.('aria-current', 'page');
    const span = document.createElement('span');
    span.className = 'nav-title';
    span.textContent = text;
    item.appendChild(span);
    item.disabled = busy || loading;
    item.onclick = () => run(action);
    return item;
  }
  function renderNavigation() {
    const query = el('nav-search').value.trim().toLocaleLowerCase(),
      matches = (text) => text.toLocaleLowerCase().includes(query);
    el('project-list').replaceChildren();
    el('general-chats').replaceChildren();
    let count = 0;
    el('general-nav').className = 'nav-item' + (!project ? ' active' : '');
    el('general-nav').disabled = busy || loading;
    for (const item of allChats.filter(
      (item) => !item.archived && !item.project_id && matches(item.title),
    )) {
      el('general-chats').appendChild(chatButton(item));
      count++;
    }
    for (const item of projects) {
      const children = allChats.filter((c) => !c.archived && c.project_id === item.id),
        matching = children.filter((c) => matches(c.title));
      if (!matches(item.name + ' ' + item.path) && !matching.length) continue;
      count++;
      const row = document.createElement('div');
      row.className = 'project-row';
      const toggle = button(
        expanded.has(item.id) ? '⌄' : '›',
        'project-toggle',
        () => {
          if (expanded.has(item.id)) expanded.delete(item.id);
          else expanded.add(item.id);
          renderNavigation();
        },
        'Expandir ou recolher ' + item.name,
      );
      toggle.setAttribute?.('aria-expanded', String(expanded.has(item.id)));
      const name = button(
        item.name,
        'project-item' + (project?.id === item.id ? ' active' : ''),
        () => view(item.id),
        item.path + ' · ' + item.progress,
      );
      row.appendChild(toggle);
      row.appendChild(name);
      const create = button(
        '+',
        'navigation-add',
        () => projectCreate(item, create),
        'Criar no projeto ' + item.name,
      );
      create.setAttribute?.('aria-label', 'Criar no projeto ' + item.name);
      create.setAttribute?.('aria-haspopup', 'menu');
      create.disabled = busy || loading;
      row.appendChild(create);
      el('project-list').appendChild(row);
      if (expanded.has(item.id) || query) {
        const list = document.createElement('div');
        list.className = 'chat-list';
        for (const c of query && !matches(item.name) ? matching : children)
          list.appendChild(chatButton(c));
        el('project-list').appendChild(list);
      }
    }
    el('nav-empty').hidden = count > 0 || !query;
  }
  function chatButton(item) {
    const row = button(
      (item.archived ? '◌ ' : '') + item.title,
      'chat-item' + (item.id === chat?.id ? ' active' : '') + (item.archived ? ' archived' : ''),
      () => view(item.project_id || '', item.id),
    );
    row.oncontextmenu = (event) => {
      event.preventDefault();
      if (!busy && !loading) contextMenu(event, item);
    };
    row.onkeydown = (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        contextMenu(event, item);
      }
    };
    row.setAttribute?.('aria-haspopup', 'menu');
    return row;
  }
  let menu = null;
  function projectCreate(item, anchor) {
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'chat-context-menu';
    menu.setAttribute('role', 'menu');
    const rect = anchor.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 230) + 'px';
    menu.style.top = rect.bottom + 'px';
    for (const [label, writer] of [
      ['Chat do projeto', false],
      ['JARVIS Writer', true],
    ]) {
      const entry = button(label, '', () => {
        closeMenu();
        void run(async () => {
          await view(item.id);
          if (writer) await window.jarvisWriterUI.createChat();
          else await newChat();
        });
      });
      entry.setAttribute('role', 'menuitem');
      menu.appendChild(entry);
    }
    document.body.appendChild(menu);
    menu.querySelector('button').focus();
    menu.onkeydown = (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        anchor.focus();
      }
    };
  }
  function closeMenu() {
    menu?.remove();
    menu = null;
  }
  function contextMenu(event, item) {
    closeMenu();
    const anchor = event.currentTarget;
    menu = document.createElement('div');
    menu.className = 'chat-context-menu';
    menu.setAttribute('role', 'menu');
    const rect = event.currentTarget?.getBoundingClientRect?.();
    menu.style.left =
      Math.max(8, Math.min(event.clientX || rect?.left || 8, window.innerWidth - 230)) + 'px';
    menu.style.top =
      Math.max(8, Math.min(event.clientY || rect?.bottom || 8, window.innerHeight - 210)) + 'px';
    const actions = [
      ['Abrir', async () => view(item.project_id || '', item.id)],
      [
        'Nome e instruções',
        async () => {
          await view(item.project_id || '', item.id);
          openSettings();
        },
      ],
      ['Limpar mensagens', () => manageItem(item, 'clear')],
    ];
    if (!item.slot)
      actions.push(
        [
          item.archived ? 'Restaurar' : 'Arquivar',
          () => manageItem(item, item.archived ? 'restore' : 'archive'),
        ],
        ['Excluir chat', () => manageItem(item, 'delete')],
      );
    for (const [label, fn] of actions) {
      const action = document.createElement('button');
      action.textContent = label;
      action.setAttribute('role', 'menuitem');
      action.onclick = () => {
        closeMenu();
        void run(fn);
      };
      menu.appendChild(action);
    }
    document.body.appendChild(menu);
    menu.querySelector('button').focus();
    menu.onkeydown = (e) => {
      if (e.key === 'Escape') {
        closeMenu();
        anchor?.focus();
      }
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const items = [...menu.children],
          index = items.indexOf(document.activeElement);
        items[(index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    };
  }
  document.addEventListener?.('click', (event) => {
    if (!event.target.closest?.('.navigation-add')) closeMenu();
  });
  document.addEventListener?.('contextmenu', (event) => {
    if (!event.target.closest?.('.chat-item')) closeMenu();
  });
  function openSettings() {
    if (!chat) return openProjectSettings();
    el('chat-title').value = chat.title;
    el('chat-instructions').value = chat.instructions || '';
    el('chat-project-inheritance').hidden = !project;
    el('manage-dialog').showModal();
  }
  function openProjectSettings() {
    if (!project) return;
    el('project-settings-name').value = project.name;
    el('project-instructions').value = project.instructions || '';
    el('project-settings-dialog').showModal();
  }
  async function manageItem(item, action) {
    const result = await window.jarvisWindow.manageChat(item.id, action);
    if (result.canceled) return;
    if (!result.ok) throw Error(result.data.detail || 'Não foi possível alterar o chat.');
    historyCache.delete(item.id);
    for (const id of ['manage-dialog', 'settings-dialog']) if (el(id)?.open) el(id).close();
    await catalog(
      project?.id || '',
      ['delete', 'archive'].includes(action) && chat?.id === item.id ? null : chat?.id,
    );
    await window.jarvisStorageUsage?.refresh();
  }
  async function showArchived() {
    const list = el('archived-chat-list');
    if (!list) return;
    list.textContent = 'Carregando…';
    try {
      const result = await api('/workspace');
      if (!list.isConnected) return;
      const archived = (result.chats || []).filter((item) => item.archived);
      list.replaceChildren();
      if (!archived.length) {
        list.textContent = 'Nenhum chat arquivado.';
        return;
      }
      for (const item of archived) {
        const row = document.createElement('div');
        row.className = 'archived-chat-row';
        const title = document.createElement('span');
        const parent = (result.projects || []).find((project) => project.id === item.project_id);
        title.textContent = item.title + (parent ? ' · ' + parent.name : ' · Chat geral');
        const restore = document.createElement('button');
        restore.textContent = 'Restaurar';
        restore.disabled = busy || loading;
        restore.onclick = async () => {
          restore.disabled = true;
          try {
            await manageItem(item, 'restore');
          } catch (error) {
            if (el('archived-status')) el('archived-status').textContent = error.message;
          } finally {
            if (restore.isConnected) restore.disabled = false;
          }
        };
        row.appendChild(title);
        row.appendChild(restore);
        list.appendChild(row);
      }
    } catch (error) {
      if (list.isConnected) list.textContent = error.message;
    }
  }
  async function openChat(id) {
    loading = true;
    controls();
    ui()?.stopVoice();
    try {
      const metadata = chats.find((item) => item.id === id);
      const cached = historyCache.get(id);
      const result =
        cached && metadata && cached.revision === revision(metadata)
          ? cached.result
          : await api('/chats/history?chat_id=' + encodeURIComponent(id));
      if ((result.chat.project_id || null) !== (project?.id || null))
        throw new Error('Esta conversa pertence a outro projeto.');
      chat = { ...result.chat, ...(metadata || {}) };
      if (!chat.writer_document_id)
        historyCache.set(id, { result: { ...result, chat }, revision: revision(chat) });
      if (el('chat-instructions')) el('chat-instructions').value = chat.instructions || '';
      if (el('chat-project-inheritance')) el('chat-project-inheritance').hidden = !project;
      olderThan = result.messages[0]?.id || null;
      messages.replaceChildren();
      ui()?.welcome(!result.messages.length);
      for (const item of result.messages) {
        addMessage(item.role, item.content);
        window.jarvisAttachments?.renderHistory(
          messages.lastElementChild,
          item.attachments,
          item.attachments_unavailable,
        );
      }
      if (chat.writer_document_id) await window.jarvisWriterUI.mount(project, chat);
      ui()?.scroll(true);
      el('chat-title').value = chat.title;
      el('archive-chat').textContent = chat.archived ? 'Restaurar' : 'Arquivar';
      try {
        (window.jarvisStorage || localStorage).setItem(
          'jarvis.selection',
          JSON.stringify({ project: project?.id || '', chat: id }),
        );
      } catch {}
    } finally {
      loading = false;
      controls();
    }
  }
  async function view(id, preferred, preserveAttachments = false) {
    if (busy || loading) return;
    await window.jarvisWriterUI?.unmount?.();
    if (
      !preserveAttachments &&
      ((chat?.id || null) !== (preferred || null) || (project?.id || '') !== id)
    )
      window.jarvisAttachments?.clear();
    if (preferred && (project?.id || '') === id && chats.some((item) => item.id === preferred)) {
      await openChat(preferred);
      return;
    }
    loading = true;
    chat = null;
    controls();
    ui()?.stopVoice();
    messages.replaceChildren();
    ui()?.welcome(false);
    try {
      const result = await post('/workspace/view', { project_id: id || null });
      project = result.project;
      chats = [...result.chats, ...result.archived_chats];
      allChats = [...allChats.filter((c) => (c.project_id || null) !== (id || null)), ...chats];
      if (id) expanded.add(id);
      if (preferred && chats.some((c) => c.id === preferred)) await openChat(preferred);
      else {
        try {
          (window.jarvisStorage || localStorage).setItem(
            'jarvis.selection',
            JSON.stringify({ project: id || '', chat: null }),
          );
        } catch {}
        ui()?.empty();
        if (project && !project.ready) {
          ui()?.welcome(false);
          addMessage(
            'assistant',
            project.scope_confirmed === 0
              ? 'Escolha os arquivos do projeto para começar. A seleção local não consome tokens.'
              : project.progress,
          );
        }
      }
    } finally {
      loading = false;
      controls();
    }
  }
  async function catalog(
    selected = project?.id || '',
    preferred = chat?.id,
    preserveAttachments = false,
  ) {
    const result = await api('/workspace');
    lastCatalogSync = Date.now();
    projects = result.projects;
    allChats = result.chats || allChats;
    if (result.chats) chats = allChats.filter((item) => (item.project_id || '') === selected);
    await view(selected, preferred, preserveAttachments);
  }
  async function openById(id) {
    const result = await api('/workspace');
    lastCatalogSync = Date.now();
    projects = result.projects;
    allChats = result.chats || allChats;
    const item = allChats.find((item) => item.id === id);
    if (!item) throw new Error('Conversa indisponível.');
    // A janela Quick pode ter alterado a conversa desde a última consulta.
    historyCache.delete(id);
    chats = allChats.filter((row) => (row.project_id || '') === (project?.id || ''));
    await view(item.project_id || '', id);
  }
  async function newChat(preserveAttachments = false) {
    if (busy || loading) return;
    loading = true;
    controls();
    try {
      const item = await post('/chats/create', {
        project_id: project?.id || null,
        title: 'Nova conversa',
      });
      loading = false;
      await catalog(project?.id || '', item.id, preserveAttachments);
      el('input').focus();
    } finally {
      loading = false;
      controls();
    }
  }
  async function syncWorkspace(force = false) {
    if (pollFailures >= 5 && !force) return;
    try {
      if (!loading && !busy && document.visibilityState !== 'hidden') {
        const remote = force || Date.now() - lastCatalogSync >= 60000;
        const indexing = project && ['queued', 'indexing'].includes(project.state);
        if (!remote && !indexing) return;
        const result = await api(remote ? '/workspace' : '/workspace/progress');
        if (remote) lastCatalogSync = Date.now();
        pollFailures = 0;
        projects = result.projects;
        allChats = result.chats || allChats;
        if (result.chats)
          chats = allChats.filter((item) => (item.project_id || '') === (project?.id || ''));
        for (const [id, entry] of historyCache) {
          const metadata = allChats.find((item) => item.id === id);
          if (result.chats && (!metadata || entry.revision !== revision(metadata))) {
            historyCache.delete(id);
            if (chat?.id === id && (!metadata || metadata.archived)) {
              chat = null;
              ui()?.stopVoice();
              messages.replaceChildren();
              ui()?.empty();
            }
            if (chat?.id === id && metadata && !metadata.archived) {
              chats = chats.map((item) => (item.id === id ? { ...item, ...metadata } : item));
              try {
                await openChat(id);
              } catch (error) {
                historyCache.set(id, entry);
                throw error;
              }
            }
          }
        }
        if (project) {
          const updated = projects.find((p) => p.id === project.id);
          if (updated) {
            const ready = !project.ready && updated.ready;
            project = updated;
            if (ready && !chat) await view(project.id);
          }
        }
        controls();
      }
    } catch {
      pollFailures = Math.min(pollFailures + 1, 5);
    }
  }
  function poll(force = false) {
    if (force && (busy || loading)) refreshRequested = true;
    if (pollInFlight) return pollInFlight;
    clearTimeout(pollTimer);
    pollInFlight = syncWorkspace(force).finally(() => {
      pollInFlight = null;
      pollTimer = setTimeout(poll, 2000 * 2 ** pollFailures);
    });
    return pollInFlight;
  }
  async function run(fn) {
    if (busy || loading) return;
    try {
      await fn();
    } catch (error) {
      addMessage('assistant', 'Erro: ' + error.message);
      controls();
    }
  }
  function handler(id, fn) {
    el(id).onclick = () => run(fn);
  }
  function init() {
    if (!initialising)
      initialising = initialize().catch((error) => {
        initialising = null;
        throw error;
      });
    return initialising;
  }
  async function initialize() {
    el('legacy-roots').hidden = true;
    el('general-nav').onclick = () => run(() => view(''));
    el('nav-search').addEventListener('input', renderNavigation);
    el('manage-open').onclick = () => run(openSettings);
    el('project-name').onclick = () => run(openProjectSettings);
    el('project-name').title = 'Configurações do projeto';
    el('project-name').setAttribute?.('role', 'button');
    el('project-name').tabIndex = 0;
    el('project-name').onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void run(openProjectSettings);
      }
    };
    if (el('project-settings-open'))
      el('project-settings-open').onclick = () => run(openProjectSettings);
    if (el('save-project-settings'))
      handler('save-project-settings', async () => {
        await post('/projects/settings', {
          project_id: project.id,
          name: el('project-settings-name').value,
          instructions: el('project-instructions').value,
        });
        el('project-settings-dialog').close();
        await catalog(project.id, chat?.id);
      });
    if (el('project-select-sources'))
      handler('project-select-sources', async () => {
        el('project-settings-dialog').close();
        await window.jarvisScope.open(project, async () => catalog(project.id, chat?.id));
      });
    if (el('new-general-chat'))
      handler('new-general-chat', async () => {
        await view('');
        await newChat();
      });
    else handler('new-chat', newChat);
    handler('add-project', async () => {
      const result = await window.jarvisWindow.authorizeFolder();
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail || 'Falha no cadastro');
      await catalog(result.data.id, null);
      await window.jarvisScope.open(project, async () => catalog(project.id, chat?.id));
    });
    handler('rename-chat', async () => {
      await post('/chats/settings', {
        chat_id: chat.id,
        title: el('chat-title').value,
        instructions: el('chat-instructions')?.value || '',
      });
      el('manage-dialog').close();
      await catalog(project?.id || '', chat.id);
    });
    handler('archive-chat', async () => {
      const result = await window.jarvisWindow.manageChat(
        chat.id,
        chat.archived ? 'restore' : 'archive',
      );
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail);
      el('manage-dialog').close();
      await catalog(project?.id || '', null);
    });
    if (el('clear-chat'))
      handler('clear-chat', async () => {
        await manageItem(chat, 'clear');
      });
    handler('delete-chat', async () => {
      const result = await window.jarvisWindow.manageChat(chat.id, 'delete');
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail);
      el('manage-dialog').close();
      await catalog(project?.id || '', null);
      await window.jarvisStorageUsage?.refresh();
    });
    handler('remove-project', async () => {
      const result = await window.jarvisWindow.removeProject(project.id);
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail);
      el('project-settings-dialog').close();
      await catalog('', null);
    });
    handler('select-sources', () =>
      window.jarvisScope.open(project, async () => catalog(project.id, chat?.id)),
    );
    handler('refresh-memory', async () => {
      project = await post('/projects/refresh', { project_id: project.id });
      controls();
      el('project-settings-dialog').close();
    });
    handler('accept-partial', async () => {
      await post('/projects/accept-partial', { project_id: project.id });
      await catalog(project.id, null);
    });
    handler('show-knowledge', async () => {
      const result = await api('/projects/knowledge?project_id=' + encodeURIComponent(project.id));
      el('project-settings-dialog').close();
      ui()?.knowledge(result.content);
    });
    handler('save-note', async () => {
      await post('/projects/note', {
        project_id: project.id,
        kind: el('note-kind').value,
        content: el('project-note').value,
      });
      el('project-note').value = '';
      el('status').textContent = 'Anotação salva';
      el('project-settings-dialog').close();
    });
    handler('older-messages', async () => {
      if (!olderThan) return;
      const area = document.getElementById('conversation-scroll'),
        height = area?.scrollHeight || 0;
      const result = await api('/chats/history?chat_id=' + chat.id + '&before=' + olderThan);
      if (!result.messages.length) {
        el('older-messages').textContent = 'Início do histórico';
        el('manage-dialog').close();
        return;
      }
      olderThan = result.messages[0].id;
      const cached = historyCache.get(chat.id);
      if (cached) {
        const seen = new Set(cached.result.messages.map((item) => item.id));
        cached.result = {
          ...cached.result,
          messages: [
            ...result.messages.filter((item) => !seen.has(item.id)),
            ...cached.result.messages,
          ],
        };
      }
      const existing = [...messages.children];
      messages.replaceChildren();
      for (const item of result.messages) {
        addMessage(item.role, item.content);
        window.jarvisAttachments?.renderHistory(
          messages.lastElementChild,
          item.attachments,
          item.attachments_unavailable,
        );
      }
      for (const row of existing) messages.appendChild(row);
      if (area) area.scrollTop = area.scrollHeight - height;
      el('manage-dialog').close();
    });
    let saved;
    try {
      saved = JSON.parse(
        (window.jarvisStorage || localStorage).getItem('jarvis.selection') || 'null',
      );
    } catch {}
    try {
      await catalog(saved?.project || '', saved?.chat);
    } catch {
      await catalog('', null);
    }
    lastCatalogSync = Date.now();
    pollTimer = setTimeout(poll, 2000);
    window.addEventListener?.('focus', () => {
      void poll(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void poll(true);
    });
    window.jarvisWindow.onWorkspaceChanged?.(() => {
      void poll(true);
    });
    window.addEventListener?.('beforeunload', () => clearTimeout(pollTimer));
  }
  return {
    init,
    view,
    openChat,
    openById,
    newChat,
    catalog,
    openSettings,
    openProjectSettings,
    showArchived,
    get canNavigate() {
      return !busy && !loading;
    },
    get project() {
      return project;
    },
    get chat() {
      return chat;
    },
    controls,
    begin() {
      if (chat) historyCache.delete(chat.id);
      busy = true;
      controls();
    },
    end() {
      busy = false;
      controls();
      if (refreshRequested) {
        refreshRequested = false;
        void poll(true);
      }
    },
  };
})();

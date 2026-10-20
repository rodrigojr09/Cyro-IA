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
  const expanded = new Set(),
    el = (id) => document.getElementById(id);
  const post = (route, body) => api(route, { method: 'POST', body: JSON.stringify(body) });
  const ui = () => window.jarvisUI;
  function controls() {
    el('send').disabled =
      busy ||
      loading ||
      !!chat?.archived ||
      !!(project && (!project.ready || project.scope_confirmed === 0));
    el('new-chat').disabled =
      busy || loading || !!(project && (!project.ready || project.scope_confirmed === 0));
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
    el('programming-mode').disabled = !!project || busy;
    el('programming-mode').checked = !!project;
    el('programming-mode').onchange?.();
    el('manage-open').disabled = busy || loading || (!chat && !project);
    renderNavigation();
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
    for (const item of allChats.filter((item) => !item.project_id && matches(item.title))) {
      el('general-chats').appendChild(chatButton(item));
      count++;
    }
    for (const item of projects) {
      const children = allChats.filter((c) => c.project_id === item.id),
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
    return button(
      (item.archived ? '◌ ' : '') + item.title,
      'chat-item' + (item.id === chat?.id ? ' active' : '') + (item.archived ? ' archived' : ''),
      () => view(item.project_id || '', item.id),
    );
  }
  async function openChat(id) {
    loading = true;
    controls();
    ui()?.stopVoice();
    try {
      const result = await api('/chats/history?chat_id=' + encodeURIComponent(id));
      if ((result.chat.project_id || null) !== (project?.id || null))
        throw new Error('Esta conversa pertence a outro projeto.');
      chat = result.chat;
      olderThan = result.messages[0]?.id || null;
      messages.replaceChildren();
      ui()?.welcome(!result.messages.length);
      for (const item of result.messages) addMessage(item.role, item.content);
      ui()?.scroll(true);
      el('chat-title').value = chat.title;
      el('archive-chat').textContent = chat.archived ? 'Restaurar' : 'Arquivar';
      try {
        localStorage.setItem(
          'jarvis.selection',
          JSON.stringify({ project: project?.id || '', chat: id }),
        );
      } catch {}
    } finally {
      loading = false;
      controls();
    }
  }
  async function view(id, preferred) {
    if (busy || loading) return;
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
          localStorage.setItem(
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
  async function catalog(selected = project?.id || '', preferred = chat?.id) {
    const result = await api('/workspace');
    projects = result.projects;
    allChats = result.chats || allChats;
    await view(selected, preferred);
  }
  async function newChat() {
    if (busy || loading) return;
    loading = true;
    controls();
    try {
      const item = await post('/chats/create', {
        project_id: project?.id || null,
        title: 'Nova conversa',
      });
      loading = false;
      await catalog(project?.id || '', item.id);
      el('input').focus();
    } finally {
      loading = false;
      controls();
    }
  }
  async function poll() {
    try {
      if (!loading && !busy) {
        const result = await api('/workspace');
        projects = result.projects;
        allChats = result.chats || allChats;
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
    } finally {
      setTimeout(poll, 2000);
    }
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
    handler('new-chat', newChat);
    handler('add-project', async () => {
      const result = await window.jarvisWindow.authorizeFolder();
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail || 'Falha no cadastro');
      await catalog(result.data.id, null);
      await window.jarvisScope.open(project, async () => catalog(project.id, chat?.id));
    });
    handler('rename-chat', async () => {
      const result = await window.jarvisWindow.manageChat(
        chat.id,
        'rename',
        el('chat-title').value,
      );
      if (!result.ok) throw new Error(result.data.detail);
      await catalog(project?.id || '', chat.id);
    });
    handler('archive-chat', async () => {
      const result = await window.jarvisWindow.manageChat(
        chat.id,
        chat.archived ? 'restore' : 'archive',
      );
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail);
      await catalog(project?.id || '', chat.id);
    });
    handler('delete-chat', async () => {
      const result = await window.jarvisWindow.manageChat(chat.id, 'delete');
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail);
      await catalog(project?.id || '', null);
    });
    handler('remove-project', async () => {
      const result = await window.jarvisWindow.removeProject(project.id);
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.data.detail);
      await catalog('', null);
    });
    handler('select-sources', () =>
      window.jarvisScope.open(project, async () => catalog(project.id, chat?.id)),
    );
    handler('refresh-memory', async () => {
      project = await post('/projects/refresh', { project_id: project.id });
      controls();
    });
    handler('accept-partial', async () => {
      await post('/projects/accept-partial', { project_id: project.id });
      await catalog(project.id, null);
    });
    handler('show-knowledge', async () => {
      const result = await api('/projects/knowledge?project_id=' + encodeURIComponent(project.id));
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
    });
    handler('older-messages', async () => {
      if (!olderThan) return;
      const area = document.getElementById('conversation-scroll'),
        height = area?.scrollHeight || 0;
      const result = await api('/chats/history?chat_id=' + chat.id + '&before=' + olderThan);
      if (!result.messages.length) {
        el('older-messages').textContent = 'Início do histórico';
        return;
      }
      olderThan = result.messages[0].id;
      const existing = [...messages.children];
      messages.replaceChildren();
      for (const item of result.messages) addMessage(item.role, item.content);
      for (const row of existing) messages.appendChild(row);
      if (area) area.scrollTop = area.scrollHeight - height;
    });
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem('jarvis.selection') || 'null');
    } catch {}
    try {
      await catalog(saved?.project || '', saved?.chat);
    } catch {
      await catalog('', null);
    }
    setTimeout(poll, 2000);
  }
  return {
    init,
    view,
    openChat,
    newChat,
    catalog,
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
      busy = true;
      controls();
    },
    end() {
      busy = false;
      controls();
    },
  };
})();

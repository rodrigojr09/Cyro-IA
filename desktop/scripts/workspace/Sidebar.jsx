import React from 'react';
import { Icon } from '../ui/Icon';
export function Sidebar({
  state,
  busy,
  search,
  onSearch,
  expanded,
  onToggle,
  onView,
  onNewChat,
  onCreateMenu,
  onChatMenu,
  onAddProject,
  onLogout,
  onSettings,
}) {
  const query = search.toLocaleLowerCase();
  const filtered = state.chats.filter(
    (chat) => !chat.archived && chat.title.toLocaleLowerCase().includes(query),
  );
  const chatButton = (chat) => (
    <button
      key={chat.id}
      title={chat.title}
      className={'nav-item chat-item' + (state.chat?.id === chat.id ? ' active' : '')}
      aria-current={state.chat?.id === chat.id ? 'page' : undefined}
      disabled={busy || !state.ready}
      onClick={() => onView(chat.project_id || '', chat.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!busy) onChatMenu(chat, event);
      }}
    >
      {chat.title}
    </button>
  );
  return (
    <aside id="sidebar" aria-label="Projetos e conversas">
      <div className="brand">
        <span className="brand-mark">C</span>
        <strong>Cyro IA</strong>
        <span className="brand-caption">WORKSPACE</span>
      </div>
      <button
        id="add-project"
        className="quiet"
        disabled={!state.ready || busy}
        onClick={onAddProject}
      >
        <Icon name="folder-plus" />
        Adicionar projeto
      </button>
      <label className="search">
        <Icon name="search" />
        <input
          id="nav-search"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar projetos e chats"
          aria-label="Buscar projetos e conversas"
        />
      </label>
      <nav id="navigation" aria-label="Navegação">
        <div className="navigation-heading">
          <button
            id="general-nav"
            className={'nav-item' + (!state.project ? ' active' : '')}
            disabled={busy || !state.ready}
            onClick={() => onView('')}
          >
            <Icon name="messages-square" />
            Conversas
          </button>
          <button
            id="new-general-chat"
            className="navigation-add"
            title="Criar conversa"
            aria-label="Criar conversa"
            disabled={busy || !state.ready}
            onClick={() => onNewChat('')}
          >
            ＋
          </button>
        </div>
        <div id="general-chats" className="chat-list">
          {filtered.filter((chat) => !chat.project_id).map(chatButton)}
        </div>
        <div className="section-label">PROJETOS</div>
        <div id="project-list">
          {state.projects
            .filter(
              (project) =>
                !search ||
                project.name.toLocaleLowerCase().includes(query) ||
                filtered.some((chat) => chat.project_id === project.id),
            )
            .map((project) => (
              <div key={project.id}>
                <div className="project-row">
                  <button
                    className="project-toggle"
                    aria-expanded={expanded.has(project.id)}
                    aria-label={'Expandir ou recolher ' + project.name}
                    onClick={() => onToggle(project.id)}
                  >
                    {expanded.has(project.id) ? '⌄' : '›'}
                  </button>
                  <button
                    className={'project-item' + (state.project?.id === project.id ? ' active' : '')}
                    disabled={busy || !state.ready}
                    onClick={() => onView(project.id)}
                  >
                    {project.name}
                  </button>
                  <button
                    className="navigation-add"
                    aria-label={'Criar no projeto ' + project.name}
                    aria-haspopup="menu"
                    disabled={busy || !state.ready}
                    onClick={(event) => onCreateMenu(project, event)}
                  >
                    ＋
                  </button>
                </div>
                {(expanded.has(project.id) || search) && (
                  <div className="chat-list">
                    {filtered.filter((chat) => chat.project_id === project.id).map(chatButton)}
                  </div>
                )}
              </div>
            ))}
        </div>
        <p id="nav-empty" hidden={!search || filtered.length > 0}>
          Nenhuma conversa encontrada.
        </p>
      </nav>
      <footer className="sidebar-footer">
        <button id="logout" onClick={onLogout}>
          <Icon name="logout" />
          Sair da conta
        </button>
        <button id="settings-open" onClick={onSettings}>
          <Icon name="settings" />
          Configurações
        </button>
        <span
          className="read-only-note"
          title="Os arquivos originais dos projetos são usados em modo leitura. O Writer só salva após aprovação ou edição explícita."
        >
          ● Projetos em modo leitura
        </span>
      </footer>
    </aside>
  );
}

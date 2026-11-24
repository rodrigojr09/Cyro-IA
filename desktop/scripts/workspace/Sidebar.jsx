import React from 'react';
import { Icon } from '../ui/Icon';
export function Sidebar({
  state,
  busy,
  search,
  onSearch,
  onMore,
  expanded,
  onToggle,
  onView,
  onNewChat,
  onCreateMenu,
  onChatMenu,
  onEV,
  evActive,
  evChats = [],
  activeEVId,
  onEVChat = () => {},
  onEVMenu = () => {},
  onLogout,
  onSettings,
}) {
  const query = search.toLocaleLowerCase();
  const filtered = (state.searchResults || state.chats).filter(
    (chat) =>
      !chat.archived && chat.slot !== 'quick' && chat.title.toLocaleLowerCase().includes(query),
  );
  const chatButton = (chat) => (
    <button
      key={chat.id}
      title={chat.title}
      className={'nav-item chat-item' + (!evActive && state.chat?.id === chat.id ? ' active' : '')}
      aria-current={!evActive && state.chat?.id === chat.id ? 'page' : undefined}
      disabled={busy || !state.ready}
      onClick={() => onView(chat.project_id || '', chat.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!busy) onChatMenu(chat, event);
      }}
    >
      <span className="nav-title">{chat.title}</span>
    </button>
  );
  return (
    <aside id="sidebar" aria-label="Espaços Virtuais e conversas">
      <div className="brand">
        <span className="brand-mark">C</span>
        <strong>Cyro IA</strong>
        <span className="brand-caption">WORKSPACE</span>
      </div>
      <button id="ev-nav" className="primary new-chat-action" disabled={!state.ready || busy} onClick={onEV}>
        <Icon name="folder-plus" />
        Novo Espaço Virtual
      </button>
      <button
        id="new-general-chat"
        className="quiet new-chat-action"
        disabled={!state.ready || busy}
        onClick={() => onNewChat('')}
      >
        <Icon name="plus" />
        Novo chat
      </button>
      <button
        id="quick-nav"
        className={'quiet' + (!evActive && state.chat?.slot === 'quick' ? ' active' : '')}
        title="Abrir o histórico do seu Chat rápido"
        disabled={!state.ready || busy || !state.chats.some((chat) => chat.slot === 'quick')}
        onClick={() => onView('', state.chats.find((chat) => chat.slot === 'quick')?.id)}
      >
        <Icon name="zap" />
        Chat rápido
      </button>
      <label className="search">
        <Icon name="search" />
        <input
          id="nav-search"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar conversas"
          aria-label="Buscar conversas"
        />
      </label>
      <nav id="navigation" aria-label="Navegação">
        {evChats.length > 0 && (
          <>
            <p className="navigation-heading">Espaços Virtuais</p>
            <div className="chat-list" id="ev-chats">
              {evChats
                .filter((chat) => chat.name.toLocaleLowerCase().includes(query))
                .map((chat) => (
                  <div
                    key={chat.id}
                    className="ev-sidebar-row"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onEVMenu(chat);
                    }}
                  >
                    <button
                      className={
                        'nav-item chat-item' + (evActive && activeEVId === chat.id ? ' active' : '')
                      }
                      aria-current={evActive && activeEVId === chat.id ? 'page' : undefined}
                      disabled={busy || !state.ready}
                      onClick={() => onEVChat(chat)}
                      title={chat.name}
                    >
                      <span className="nav-title">{chat.name}</span>
                      <small>EV</small>
                    </button>
                    <button
                      className="ev-sidebar-options"
                      aria-label={'Opções de ' + chat.name}
                      title="Opções do EV"
                      disabled={busy || !state.ready}
                      onClick={() => onEVMenu(chat)}
                    >
                      ⋯
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}
        <p className="navigation-heading">Conversas recentes</p>
        <div id="general-chats" className="chat-list">
          {filtered.filter((chat) => !chat.project_id).map(chatButton)}
        </div>
        {state.catalogNext != null && (
          <button disabled={busy || state.catalogLoading} onClick={onMore}>
            {state.catalogLoading ? 'Carregando…' : 'Mais conversas'}
          </button>
        )}
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
          title="Os projetos locais antigos não são enviados à nuvem automaticamente."
        >
          <span className="read-only-dot" aria-hidden="true" />
          Dados antigos preservados
        </span>
      </footer>
    </aside>
  );
}

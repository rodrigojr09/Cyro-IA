import React, { useState } from 'react';
import { Dialog } from '../ui/components';
import { Icon } from '../ui/Icon';

const permissionLabels = {
  workbench: 'Usar a IDE privada, criar arquivos/tabelas e solicitar execução com sua autorização',
  storage: 'Salvar dados privados deste EV',
  messages: 'Responder na conversa do EV',
  files: 'Consultar arquivos privados do EV',
};

export function EVSDKNotice({ extension, sdkVersion }) {
  const status = extension?.sdkStatus;
  if (status !== 'outdated' && status !== 'undeclared') return null;
  return (
    <p className="ev-sdk-notice">
      {status === 'outdated'
        ? `SDK desatualizado. Este EV declara a versão ${extension.sdkVersion}. SDK atual do Cyro ${sdkVersion}.`
        : 'Este EV ainda não declara a versão do SDK.'}
    </p>
  );
}

export function EVCatalog({ open, catalog, busy, error, onBack, onRefresh, onManage, onUse }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const selected = catalog?.extensions?.find((item) => item.id === selectedId);
  const visible = (catalog?.extensions || []).filter(
    (item) =>
      (filter === 'all' || (filter === 'installed' ? item.installed : !item.installed)) &&
      `${item.name} ${item.description}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.trim().toLocaleLowerCase('pt-BR')),
  );
  return (
    <Dialog
      id="ev-extension-menu"
      title="Catálogo de EVs"
      open={open}
      onClose={() => {
        if (!busy) onBack();
      }}
    >
      <section
        className="integrations-page ev-extension-catalog"
        aria-label="Catálogo de extensões EV"
        aria-busy={busy}
      >
        <header className="integrations-heading">
          <span className="integrations-eyebrow">EXTENSÕES PARA SEUS ESPAÇOS</span>
          <h3>Um EV para cada trabalho</h3>
          <p>Instale um tipo na sua conta e crie um chat com as ferramentas certas para você.</p>
        </header>
        <button type="button" className="ev-catalog-back" disabled={busy} onClick={onBack}>
          Voltar à criação
        </button>
        {error && (
          <p className="ev-menu-error" role="alert">
            {error}
          </p>
        )}
        {!catalog && (
          <button disabled={busy} onClick={onRefresh}>
            Atualizar catálogo
          </button>
        )}
        {catalog && !catalog.enabled && (
          <p className="integrations-empty">
            O catálogo de EVs ainda não foi ativado neste servidor.
          </p>
        )}
        {catalog?.enabled && !selected && (
          <>
            <label className="integrations-search-label" htmlFor="ev-catalog-search">
              Pesquisar EVs
            </label>
            <div className="integrations-search">
              <Icon name="search" />
              <input
                id="ev-catalog-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome ou descrição"
              />
            </div>
            <div className="integrations-filters" role="group" aria-label="Filtrar EVs">
              {[
                ['all', 'Todos'],
                ['installed', 'Instalados'],
                ['available', 'Disponíveis'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="integrations-count" role="status">
              {visible.length} {visible.length === 1 ? 'extensão' : 'extensões'}
            </p>
            <div className="integrations-grid">
              {visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="integration-card"
                  data-extension={item.id}
                  aria-label={'Ver detalhes de ' + item.name}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="integration-card-top">
                    <span className="integration-service-icon">
                      <Icon name="folder" />
                    </span>
                    <span className="integration-status">
                      {item.installed ? 'Instalado' : 'Disponível'}
                    </span>
                  </span>
                  <strong>{item.name}</strong>
                  <p className="integration-description">{item.description}</p>
                  <span className="integration-card-action">
                    Ver detalhes <Icon name="chevron-right" />
                  </span>
                </button>
              ))}
            </div>
            {!visible.length && (
              <p className="integrations-empty">
                Nenhum EV encontrado. Tente outra pesquisa ou filtro.
              </p>
            )}
          </>
        )}
        {catalog?.enabled && selected && (
          <section className="integration-details" aria-label={'Detalhes de ' + selected.name}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSelectedId(null);
                requestAnimationFrame(() =>
                  document.querySelector('[data-extension="' + selected.id + '"]')?.focus(),
                );
              }}
            >
              Voltar ao catálogo
            </button>
            <div className="ev-extension-identity">
              <span className="integration-service-icon">
                <Icon name="folder" />
              </span>
              <div>
                <h3>{selected.name}</h3>
                <span className="integration-status">
                  {selected.installed ? 'Instalado na sua conta' : 'Disponível para instalar'} · v
                  {selected.version}
                </span>
              </div>
            </div>
            <p>{selected.description}</p>
            <EVSDKNotice extension={selected} sdkVersion={catalog.sdkVersion} />
            <h4>Permissões do EV</h4>
            <ul>
              {(selected.permissions || []).map((permission) => (
                <li key={permission}>{permissionLabels[permission] || permission}</li>
              ))}
            </ul>
            <p className="ev-catalog-privacy">
              Cada EV mantém seus próprios arquivos e memória privada, com acesso à memória
              principal da sua conta.
            </p>
            <p className="ev-catalog-privacy">
              Atualizações automáticas: a versão mais recente é aplicada aos seus chats EV,
              preservando memória e arquivos.
            </p>
            <div className="ev-menu-actions">
              {selected.installed && (
                <button
                  type="button"
                  className="ev-primary-action"
                  disabled={busy}
                  onClick={() => onUse(selected)}
                >
                  Usar este tipo
                </button>
              )}
              <button
                type="button"
                className={selected.installed ? '' : 'ev-primary-action'}
                disabled={busy}
                onClick={() => onManage(selected, !selected.installed)}
              >
                {busy
                  ? 'Aguarde…'
                  : `${selected.installed ? 'Desinstalar' : 'Instalar'} ${selected.name}`}
              </button>
            </div>
            {selected.installed && (
              <p className="ev-catalog-preserved">
                Desinstalar preserva os dados dos espaços existentes.
              </p>
            )}
          </section>
        )}
      </section>
    </Dialog>
  );
}

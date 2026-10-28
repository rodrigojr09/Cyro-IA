import React, { useEffect, useState } from 'react';
import { integrationCatalog, integrationStatusLabels, filterIntegrations } from './catalog';
import { Icon } from '../ui/Icon';
export async function spotifyRequest(input) {
  if (!window.jarvisSpotify) throw Error('Abra o Cyro Cloud para usar esta integração.');
  const result = await window.jarvisSpotify.request(input);
  if (result?.error)
    throw Object.assign(new Error(result.error), { retryAfter: result.retryAfter });
  return result;
}
export function SpotifyLogo() {
  return (
    <picture>
      <img
        src="assets/spotify-white.svg"
        alt="Spotify"
        className="spotify-logo spotify-logo-white"
      />
      <img
        src="assets/spotify-black.svg"
        alt="Spotify"
        className="spotify-logo spotify-logo-black"
      />
    </picture>
  );
}
export function Integrations({ catalog = integrationCatalog }) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState(null),
    [connection, setConnection] = useState(null);
  const visible = filterIntegrations(
    catalog.map((item) =>
      item.id === 'spotify' && ['connected', 'disconnected', 'error'].includes(connection?.status)
        ? { ...item, status: connection.status }
        : item,
    ),
    query,
    filter,
  );
  return (
    <section className="integrations-page" aria-labelledby="integrations-heading">
      <header className="integrations-heading">
        <span className="integrations-eyebrow">APLICATIVOS E SERVIÇOS</span>
        <h3 id="integrations-heading">Integrações</h3>
        <p>
          Conecte seus aplicativos e serviços favoritos ao Cyro para ampliar suas possibilidades.
        </p>
      </header>
      <div id="integrations-catalog-view" hidden={!!selected}>
        <label className="integrations-search-label" htmlFor="integrations-search">
          Pesquisar integrações
        </label>
        <div className="integrations-search">
          <input
            id="integrations-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, categoria ou descrição"
          />
        </div>
        <div
          id="integrations-filters"
          className="integrations-filters"
          role="group"
          aria-label="Filtrar integrações"
        >
          {[
            ['all', 'Todas'],
            ['connected', 'Conectadas'],
            ['available', 'Disponíveis'],
            ['coming_soon', 'Em breve'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p id="integrations-connection-note">
          {connection?.status === 'connected'
            ? 'Spotify conectado.'
            : 'Escolha uma integração para ver as opções disponíveis.'}
        </p>
        <p id="integrations-count" role="status" aria-live="polite">
          {visible.length} integração(ões)
        </p>
        <div id="integrations-grid" className="integrations-grid">
          {visible.map((item) => (
            <button
              key={item.id}
              className="integration-card"
              onClick={() => setSelected(item)}
              aria-label={'Ver detalhes de ' + item.name}
              data-integration={item.id}
              data-integration-id={item.id}
            >
              {item.id === 'spotify' ? (
                <SpotifyLogo />
              ) : (
                <span className="integration-service-icon">
                  <Icon
                    name={
                      {
                        discord: 'message',
                        github: 'git',
                        notion: 'text',
                        calendar: 'calendar',
                        browser: 'globe',
                      }[item.id] || 'globe'
                    }
                  />
                </span>
              )}
              <strong>{item.name}</strong>
              <p>{item.description}</p>
              <span>{integrationStatusLabels[item.status] || item.status}</span>
            </button>
          ))}
        </div>
        <p id="integrations-empty" className="integrations-empty" hidden={visible.length > 0}>
          Nenhuma integração encontrada. Tente outra pesquisa ou filtro.
        </p>
      </div>
      {selected && (
        <section
          id="integration-details"
          className="integration-details"
          aria-labelledby="integration-details-name"
        >
          <button
            id="integration-details-back"
            onClick={() => {
              const id = selected.id;
              setSelected(null);
              requestAnimationFrame(() =>
                document.querySelector('[data-integration="' + id + '"]')?.focus(),
              );
            }}
          >
            Voltar ao catálogo
          </button>
          <h3 id="integration-details-name">{selected.name}</h3>
          <p>{selected.description}</p>
          <ul id="integration-capabilities">
            {selected.capabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
          <span>{integrationStatusLabels[selected.status]}</span>
          {selected.id === 'spotify' ? (
            <SpotifySettings onChanged={setConnection} />
          ) : (
            <p>
              {selected.details ||
                'Esta integração ainda não está disponível. Nenhuma conta será conectada.'}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
export function SpotifySettings({ onChanged }) {
  const [status, setStatus] = useState(null),
    [transaction, setTransaction] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const refresh = async () => {
    const result = await spotifyRequest({ operation: 'status' });
    setStatus(result);
    onChanged(result);
    return result;
  };
  useEffect(() => {
    let active = true;
    void spotifyRequest({ operation: 'status' })
      .then((value) => {
        if (active) {
          setStatus(value);
          onChanged(value);
        }
      })
      .catch((error) => active && setError(error.message));
    const unsubscribe = window.jarvisSpotify?.onChanged(
      () => void refresh().catch((error) => setError(error.message)),
    );
    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!transaction) return;
    const timer = setInterval(() => {
      void spotifyRequest({ operation: 'poll', transactionId: transaction })
        .then((result) => {
          if (['completed', 'failed', 'expired', 'cancelled', 'denied'].includes(result.status)) {
            setTransaction(null);
            void refresh();
          }
        })
        .catch((error) => setError(error.message));
    }, 4000);
    return () => clearInterval(timer);
  }, [transaction]);
  useEffect(() => {
    const focus = () => {
      if (!transaction && !busy) void refresh().catch((error) => setError(error.message));
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [transaction, busy]);
  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="spotify-settings">
      <p role="status">
        {error ||
          (transaction
            ? 'Aguardando a autorização no navegador…'
            : !status?.configured
              ? status?.configurationError ||
                'Spotify aguarda configuração pelo administrador no Cloud.'
              : status?.status === 'connected'
                ? 'Conectado · ' + (status.displayName || 'Spotify')
                : 'Não conectado.')}
      </p>
      <div className="spotify-actions">
        {status?.status === 'connected' ? (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await spotifyRequest({ operation: 'disconnect' });
                await refresh();
              })
            }
          >
            Desconectar
          </button>
        ) : transaction ? (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await spotifyRequest({ operation: 'cancel', transactionId: transaction });
                setTransaction(null);
              })
            }
          >
            Cancelar
          </button>
        ) : (
          <button
            disabled={busy || !status?.configured}
            onClick={() =>
              run(async () => {
                const result = await spotifyRequest({ operation: 'start' });
                setTransaction(result.transactionId);
              })
            }
          >
            Conectar
          </button>
        )}
        <button disabled={busy} onClick={() => run(refresh)}>
          Atualizar conexão
        </button>
      </div>
      <p>
        Controle suas músicas pelo chat ou Quick Chat. Os comandos exigem uma conta e um dispositivo
        elegíveis. Desconectar apaga os tokens no Cyro. Nenhuma música é reproduzida
        automaticamente.
      </p>
    </div>
  );
}

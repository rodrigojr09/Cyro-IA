import React, { useEffect, useState, useRef } from 'react';
import { evRequest } from '../workspace/EVWorkspace';
import { Markdown } from '../ui/components';
import { publicError } from '../shared/bridge';

function ScopeMemory({ scope, projectId }) {
  const pending = useRef(null);
  const [data, setData] = useState(null),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0);
  const [error, setError] = useState(''),
    [working, setWorking] = useState(false),
    [refresh, setRefresh] = useState(0),
    [notice, setNotice] = useState('');
  const [content, setContent] = useState(''),
    [editing, setEditing] = useState(null),
    [forget, setForget] = useState(null),
    [history, setHistory] = useState(null);
  const target = { scope, ...(scope === 'EV' ? { projectId } : {}) };
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () => {
        setWorking(true);
        setError('');
        evRequest({ action: 'memory.list', ...target, search, offset, limit: 30 })
          .then((out) => {
            if (alive)
              setData((old) => ({
                ...out,
                items: offset ? [...(old?.items || []), ...out.items] : out.items,
              }));
          })
          .catch((e) => {
            if (alive) setError(publicError(e));
          })
          .finally(() => {
            if (alive) setWorking(false);
          });
      },
      search ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, offset, refresh]);
  async function run(command) {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      const outgoing = { ...target, ...command };
      if (command.operationId) {
        const key = JSON.stringify({ ...outgoing, operationId: undefined });
        if (pending.current?.key !== key) pending.current = { key, id: command.operationId };
        outgoing.operationId = pending.current.id;
      }
      const out = await evRequest(outgoing);
      if (command.operationId) pending.current = null;
      if (command.action === 'memory.migrate')
        setNotice(
          `${out.imported} registro(s) importado(s), ${out.needsReview} precisam de revisão. ${out.hasMore ? 'Há mais mensagens; execute novamente para continuar.' : 'Lote concluído.'} Os históricos originais permanecem preservados.`,
        );
      if (command.action === 'memory.history') setHistory(out);
      else {
        setContent('');
        setEditing(null);
        setForget(null);
        setOffset(0);
        setRefresh((n) => n + 1);
      }
    } catch (e) {
      setError(publicError(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <section
      className="memory-panel"
      aria-label={scope === 'MAIN' ? 'Memória principal' : 'Memória do EV'}
    >
      <p>
        {scope === 'MAIN'
          ? 'Compartilhada entre suas conversas e disponível nos seus EVs.'
          : 'Disponível somente nas conversas deste espaço.'}{' '}
        Registros confirmados são preservados no banco; o Files recebe o resumo Markdown.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {working && <p role="status">Atualizando memória…</p>}
      <label>
        Buscar fatos
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      <div className="memory-actions">
        <button disabled={working} onClick={() => setRefresh((n) => n + 1)}>
          Atualizar
        </button>
        <button disabled={working} onClick={() => run({ action: 'memory.rebuild' })}>
          Sincronizar resumo
        </button>
        <button disabled={working} onClick={() => run({ action: 'memory.migrate' })}>
          Importar fatos de mensagens anteriores
        </button>
      </div>
      {data && (
        <>
          <p>
            Resumo:{' '}
            {{
              READY: 'sincronizado',
              PENDING: 'sincronização pendente',
              RUNNING: 'sincronizando',
              ERROR: 'aguardando recuperação',
            }[data.store.syncState] || data.store.syncState}{' '}
            · revisão {data.store.revision}
          </p>
          {data.store.summary && (
            <details>
              <summary>Ver resumo Markdown</summary>
              <Markdown text={data.store.summary} />
            </details>
          )}
          {!data.items.length && <p>Nenhum fato encontrado nesta memória.</p>}
          <ul className="memory-items">
            {data.items.map((item) => (
              <li key={item.id}>
                <p>{item.content}</p>
                <small>
                  Origem:{' '}
                  {{
                    USER_CHAT: 'mensagem do usuário',
                    USER_API: 'edição nas configurações',
                    LEGACY_EV: 'memória anterior do EV',
                    LEGACY_USER_INSTRUCTIONS: 'preferências anteriores',
                    RESOURCE: 'recurso do espaço',
                  }[item.origin?.kind] || 'registro do usuário'}{' '}
                  · {new Date(item.updatedAt).toLocaleString('pt-BR')}
                </small>
                <div className="memory-actions">
                  <button
                    disabled={working}
                    onClick={() => {
                      setEditing(item);
                      setContent(item.content);
                    }}
                  >
                    Corrigir
                  </button>
                  <button disabled={working} onClick={() => setForget(item.id)}>
                    Esquecer
                  </button>
                  <button
                    disabled={working}
                    onClick={() => run({ action: 'memory.history', id: item.id })}
                  >
                    Origem e histórico
                  </button>
                </div>
                {forget === item.id && (
                  <p>
                    Retirar este fato da memória ativa?{' '}
                    <button
                      disabled={working}
                      onClick={() =>
                        run({
                          action: 'memory.forget',
                          id: item.id,
                          expectedRevision: item.revision,
                          operationId: crypto.randomUUID(),
                        })
                      }
                    >
                      Confirmar exclusão
                    </button>
                    <button onClick={() => setForget(null)}>Cancelar</button>
                  </p>
                )}
              </li>
            ))}
          </ul>
          {data.next != null && (
            <button disabled={working} onClick={() => setOffset(data.next)}>
              Mais registros
            </button>
          )}
        </>
      )}
      <label>
        {editing ? 'Corrigir fato' : 'Adicionar fato'}
        <textarea
          disabled={working} aria-label="Conteúdo da memória"
          value={content}
          maxLength={2000}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      <button
        disabled={working || !content.trim()}
        onClick={() =>
          run({
            action: editing ? 'memory.correct' : 'memory.put',
            content,
            operationId: crypto.randomUUID(),
            ...(editing ? { id: editing.id, expectedRevision: editing.revision } : {}),
          })
        }
      >
        Salvar memória
      </button>
      {editing && (
        <button
          onClick={() => {
            setEditing(null);
            setContent('');
          }}
        >
          Cancelar edição
        </button>
      )}
      {history && (
        <section aria-label="Histórico da memória">
          <h4>Origem e versões</h4>
          <p>{history.item.content}</p>
          <p>
            Origem: {history.item.origin?.kind} · revisão {history.item.revision}
          </p>
          {history.history.map((h) => (
            <p key={h.id}>
              Revisão {h.revision}: {h.content} · {new Date(h.changedAt).toLocaleString('pt-BR')}
            </p>
          ))}
          {history.before != null && (
            <button
              disabled={working}
              onClick={() =>
                run({ action: 'memory.history', id: history.item.id, before: history.before })
              }
            >
              Versões anteriores
            </button>
          )}
        </section>
      )}
    </section>
  );
}
export function MemoryPanel({ projectId }) {
  const [scope, setScope] = useState('MAIN');
  useEffect(() => {
    if (!projectId) setScope('MAIN');
  }, [projectId]);
  return (
    <>
      <h3>Memória persistente</h3>
      <nav aria-label="Escopo de memória">
        <button aria-pressed={scope === 'MAIN'} onClick={() => setScope('MAIN')}>
          Principal
        </button>
        {projectId && (
          <button aria-pressed={scope === 'EV'} onClick={() => setScope('EV')}>
            Espaço ativo
          </button>
        )}
      </nav>
      <ScopeMemory key={scope + ':' + (projectId || '')} scope={scope} projectId={projectId} />
    </>
  );
}

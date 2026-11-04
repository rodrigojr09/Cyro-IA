import React, { useEffect, useState } from 'react';
import { publicError } from '../shared/bridge';

export function EVNotes({
  projectId,
  hidden,
  refreshKey,
  request,
  onUse,
  renderFiscal,
  renderAnalysis,
}) {
  const [files, setFiles] = useState([]),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState(null);
  const [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [analysisId, setAnalysisId] = useState(null);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setFiles([]);
    setSelected(null);
    setDetail(null);
    setAnalysisId(null);
    setSearch('');
    setOffset(0);
  }, [projectId]);
  useEffect(() => {
    if (!projectId || hidden) return;
    let alive = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError('');
        request({ action: 'files.list', projectId, search, offset, limit: 30 })
          .then((out) => {
            if (alive) {
              setFiles((old) =>
                offset
                  ? [...new Map([...old, ...out.files].map((f) => [f.id, f])).values()]
                  : out.files,
              );
              setNext(out.next);
            }
          })
          .catch((e) => {
            if (alive) setError(publicError(e));
          })
          .finally(() => {
            if (alive) setLoading(false);
          });
      },
      search ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [projectId, hidden, search, offset, refreshKey, retry]);
  useEffect(() => {
    setDetail(null);
    setAnalysisId(null);
    if (!selected || !projectId || hidden) return;
    let alive = true;
    request({ action: 'file.get', projectId, id: selected })
      .then((out) => {
        if (alive) {
          setDetail(out);
          setAnalysisId(out.analyses?.[0]?.id || null);
        }
      })
      .catch((e) => {
        if (alive) setError(publicError(e));
      });
    return () => {
      alive = false;
    };
  }, [projectId, selected, hidden, refreshKey, retry]);
  return (
    <aside className="ev-notes" aria-label="Notas e análises do espaço">
      <header>
        <h2>Notas e arquivos</h2>
        <button
          type="button"
          onClick={() => setRetry((n) => n + 1)}
          disabled={!projectId || loading}
        >
          Atualizar
        </button>
      </header>
      {!projectId ? (
        <p>Abra um espaço para consultar seus documentos.</p>
      ) : (
        <>
          <input
            aria-label="Buscar notas e arquivos"
            placeholder="Buscar pelo nome…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
          {loading && <p role="status">Carregando arquivos…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && !files.length && !error && (
            <p>Nenhum arquivo encontrado. Use o clipe da conversa para enviar uma nota.</p>
          )}
          <ul>
            {files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  aria-pressed={selected === file.id}
                  onClick={() => setSelected(file.id)}
                >
                  <strong>{file.name}</strong>
                  <small>
                    {{
                      READY: 'Enviado',
                      PROCESSED: 'Lido',
                      ERROR: 'Falha na leitura',
                      PROCESSING: 'Processando',
                    }[file.status] || file.status}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {next != null && (
            <button type="button" disabled={loading} onClick={() => setOffset(next)}>
              Mais arquivos
            </button>
          )}
          {detail && (
            <section className="ev-note-detail" aria-label="Detalhes da nota selecionada">
              <h3>{detail.file.name}</h3>
              <button type="button" onClick={() => onUse(detail.file)}>
                Usar na conversa
              </button>
              {detail.file.error && <p role="alert">Falha na leitura: {detail.file.error}</p>}
              {detail.extracted?.type === 'FISCAL' && renderFiscal(detail.extracted)}
              <h3>Observações da leitura</h3>
              {!detail.extracted ? (
                <p>Ainda não há extração disponível. Peça ao Cyro para ler esta nota.</p>
              ) : !detail.extracted.warnings?.length ? (
                <p>Nenhuma observação registrada pelo leitor.</p>
              ) : (
                <ul>
                  {detail.extracted.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <h3>Análises salvas</h3>
              {!detail.analyses?.length ? (
                <p>
                  Ainda não há análises desta nota. Selecione “Usar na conversa” e faça sua
                  pergunta.
                </p>
              ) : (
                <>
                  <select
                    aria-label="Selecionar análise da nota"
                    value={analysisId || ''}
                    onChange={(e) => setAnalysisId(e.target.value)}
                  >
                    {detail.analyses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {{
                          PROCESS_FILE: 'Leitura',
                          CHAT: 'Conversa sobre a nota',
                          SUM: 'Soma',
                          COMPARE: 'Comparação',
                          DUPLICATES: 'Duplicidades',
                          GROUP: 'Agrupamento',
                        }[a.kind] || a.kind}{' '}
                        · {a.state} · {new Date(a.createdAt).toLocaleString('pt-BR')}
                      </option>
                    ))}
                  </select>
                  {analysisId && renderAnalysis(detail.analyses.find((a) => a.id === analysisId))}
                </>
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
}

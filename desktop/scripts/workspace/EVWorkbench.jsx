import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/components';
import { publicError } from '../shared/bridge';
export function EVWorkbench({ projectId, open, onClose, request }) {
  const [state, setState] = useState(null),
    [name, setName] = useState('main.py'),
    [content, setContent] = useState('print("Olá, Cyro!")'),
    [runtime, setRuntime] = useState('python'),
    [source, setSource] = useState('exec(open("main.py").read())'),
    [tab, setTab] = useState('files'),
    [tableName, setTableName] = useState('dados'),
    [columns, setColumns] = useState('Nome,Valor'),
    [rows, setRows] = useState([['Exemplo', 10]]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [output, setOutput] = useState(''),
    [dirty, setDirty] = useState(false);
  const refresh = async () => {
    const next = await request({ action: 'workbench.list', projectId });
    setState(next);
    return next;
  };
  useEffect(() => {
    if (!open) return;
    let active = true;
    setState(null);
    void Promise.all([
      request({ action: 'workbench.list', projectId }),
      window.cyroEV?.draft?.({ projectId, channel: 'IDE', operation: 'read' }) ||
        Promise.resolve(null),
    ])
      .then(([next, draft]) => {
        if (!active) return;
        setState(next);
        const file = draft || next.files[0];
        if (file) {
          setName(file.name);
          setContent(file.content);
        }
        setDirty(!!draft);
        if (draft) setNotice('Rascunho local recuperado.');
      })
      .catch((e) => {
        if (active) setNotice(publicError(e));
      });
    return () => {
      active = false;
    };
  }, [open, projectId]);
  useEffect(() => {
    if (dirty)
      void window.cyroEV
        ?.draft?.({ projectId, channel: 'IDE', operation: 'write', content: { name, content } })
        .catch((e) => setNotice(publicError(e)));
  }, [projectId, name, content, dirty]);
  async function perform(fn) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setNotice(publicError(e));
    } finally {
      setBusy(false);
    }
  }
  const write = async () => {
    const next = await request({
      action: 'workbench.write',
      projectId,
      operationId: crypto.randomUUID(),
      expectedRevision: state.revision,
      name,
      content,
    });
    setState(next);
    setDirty(false);
    await window.cyroEV?.draft?.({ projectId, channel: 'IDE', operation: 'remove' });
    setNotice('Arquivo salvo no EV.');
  };
  const remove = (kind, name) =>
    perform(async () => {
      if (window.confirm('Remover este item da IDE?')) {
        setState(
          await request({
            action: 'workbench.remove',
            projectId,
            operationId: crypto.randomUUID(),
            expectedRevision: state.revision,
            kind,
            name,
          }),
        );
      }
    });
  const close = () => {
    if (!dirty || window.confirm('Descartar alterações não salvas da IDE?')) {
      setDirty(false);
      void window.cyroEV?.draft?.({ projectId, channel: 'IDE', operation: 'remove' });
      onClose();
    }
  };
  return (
    <Dialog id="ev-workbench" title="IDE do EV" open={open} onClose={close}>
      <div className="ev-workbench">
        <p>Arquivos e tabelas privados deste EV. Código só executa após sua autorização.</p>
        <nav aria-label="Áreas da IDE">
          {[
            ['files', 'Arquivos'],
            ['tables', 'Tabelas'],
            ['run', 'Execução'],
          ].map(([id, label]) => (
            <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => void perform(refresh)}>
            Atualizar
          </button>
        </nav>
        {notice && <p role="status">{notice}</p>}
        {!state ? (
          <p>Carregando IDE…</p>
        ) : (
          <>
            {tab === 'files' && (
              <div className="ev-ide-files">
                <aside aria-label="Arquivos da IDE">
                  {state.files.map((f) => (
                    <button
                      type="button"
                      key={f.name}
                      onClick={() => {
                        if (!dirty || window.confirm('Descartar alterações não salvas?')) {
                          setName(f.name);
                          setContent(f.content);
                          setDirty(false);
                        }
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                </aside>
                <div>
                  <label>
                    Nome do arquivo
                    <input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setDirty(true);
                      }}
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Código ou conteúdo
                    <textarea
                      spellCheck={false}
                      aria-label="Editor de código"
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        setDirty(true);
                      }}
                      maxLength={64000}
                    />
                  </label>
                  <button disabled={busy} onClick={() => void perform(write)}>
                    Salvar no EV
                  </button>
                  <button
                    disabled={busy || dirty || !state.files.some((f) => f.name === name)}
                    onClick={() =>
                      void perform(() => window.cyroEV.exportSource({ projectId, name }))
                    }
                  >
                    Baixar arquivo
                  </button>
                  <button
                    disabled={busy || !state.files.some((f) => f.name === name)}
                    onClick={() => void remove('file', name)}
                  >
                    Remover arquivo
                  </button>
                </div>
              </div>
            )}
            {tab === 'tables' && (
              <>
                <label>
                  Nome da tabela
                  <input value={tableName} onChange={(e) => setTableName(e.target.value)} />
                </label>
                <label>
                  Colunas separadas por vírgula
                  <input value={columns} onChange={(e) => setColumns(e.target.value)} />
                </label>
                <div className="ev-chat-table-scroll">
                  <table aria-label="Editor da tabela">
                    <thead>
                      <tr>
                        {columns.split(',').map((c, j) => (
                          <th key={j}>{c.trim() || `Coluna ${j + 1}`}</th>
                        ))}
                        <th>Linhas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i}>
                          {columns.split(',').map((c, j) => (
                            <td key={j}>
                              <input
                                aria-label={`Linha ${i + 1}, coluna ${j + 1}`}
                                value={String(row[j] ?? '')}
                                maxLength={8000}
                                onChange={(e) =>
                                  setRows((old) =>
                                    old.map((r, index) =>
                                      index === i
                                        ? columns
                                            .split(',')
                                            .map((_, col) =>
                                              col === j ? e.target.value : (r[col] ?? ''),
                                            )
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              onClick={() =>
                                setRows((old) => old.filter((_, index) => index !== i))
                              }
                            >
                              Remover linha {i + 1}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  disabled={rows.length >= 500}
                  onClick={() => setRows((old) => [...old, columns.split(',').map(() => '')])}
                >
                  Adicionar linha
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      setState(
                        await request({
                          action: 'workbench.table',
                          projectId,
                          operationId: crypto.randomUUID(),
                          expectedRevision: state.revision,
                          name: tableName,
                          columns: columns.split(',').map((c) => c.trim()),
                          rows: rows.map((row) => columns.split(',').map((_, j) => row[j] ?? '')),
                        }),
                      );
                      setNotice('Tabela salva no EV.');
                    })
                  }
                >
                  Salvar tabela
                </button>
                {state.tables.map((t) => (
                  <div key={t.name}>
                    <button
                      onClick={() => {
                        setTableName(t.name);
                        setColumns(t.columns.join(','));
                        setRows(t.rows.map((row) => [...row]));
                      }}
                    >
                      {t.name}
                    </button>
                    <div className="ev-chat-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {t.columns.map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t.rows.slice(0, 50).map((row, i) => (
                            <tr key={i}>
                              {row.map((cell, j) => (
                                <td key={j}>{String(cell ?? '')}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <small>{t.rows.length} linhas · prévia de até 50</small>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          const csv = [t.columns, ...t.rows]
                            .map((row) =>
                              row
                                .map((cell) => {
                                  let v = String(cell ?? '');
                                  if (typeof cell==='string' && /^(?:\s*[=+@-]|[\t\r])/.test(v)) v = "'" + v;
                                  return '"' + v.replaceAll('"', '""') + '"';
                                })
                                .join(','),
                            )
                            .join('\r\n');
                          const filename = t.name.slice(0, 95) + '.csv';
                          setState(
                            await request({
                              action: 'workbench.write',
                              projectId,
                              operationId: crypto.randomUUID(),
                              expectedRevision: state.revision,
                              name: filename,
                              content: csv,
                            }),
                          );
                          setName(filename);
                          setContent(csv);
                          setDirty(false);
                          setTab('files');
                          setNotice('CSV criado. Use Baixar arquivo para exportar.');
                        })
                      }
                    >
                      Criar arquivo CSV
                    </button>
                    <button disabled={busy} onClick={() => void remove('table', t.name)}>
                      Remover tabela
                    </button>
                  </div>
                ))}
              </>
            )}
            {tab === 'run' && (
              <>
                <p>
                  Requer Docker Desktop e imagem local: node:24-alpine, python:3.12-alpine ou
                  alpine:3.21. Sem rede; limite de 15 segundos e 128 MB. Arquivos criados durante a
                  execução são temporários.
                </p>
                <label>
                  Linguagem
                  <select
                    value={runtime}
                    onChange={(e) => {
                      setRuntime(e.target.value);
                      setSource(
                        e.target.value === 'python'
                          ? 'exec(open("main.py").read())'
                          : e.target.value === 'javascript'
                            ? 'console.log("Olá, Cyro!")'
                            : 'ls -la',
                      );
                    }}
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="shell">Comandos Linux</option>
                  </select>
                </label>
                <label>
                  Código ou comando
                  <textarea
                    aria-label="Código para executar"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    maxLength={32000}
                  />
                </label>
                <small>
                  Para executar um arquivo, use Comandos Linux somente para comandos disponíveis no
                  Alpine; em Python use exec(open("main.py").read()).
                </small>
                <button
                  disabled={busy || dirty}
                  onClick={() =>
                    void perform(async () => {
                      const next = await request({
                        action: 'workbench.execute',
                        projectId,
                        operationId: crypto.randomUUID(),
                        expectedRevision: state.revision,
                        runtime,
                        source,
                      });
                      setState(next);
                      setNotice('Solicitação criada. Revise e autorize abaixo.');
                    })
                  }
                >
                  Solicitar execução
                </button>
                {state.executions.map((item) => (
                  <section key={item.id}>
                    <strong>
                      {item.runtime} · {new Date(item.createdAt).toLocaleString()}
                    </strong>
                    <pre>{item.source}</pre>
                    <details>
                      <summary>Revisar arquivos desta execução</summary>
                      {item.files.map((f) => (
                        <div key={f.name}>
                          <strong>{f.name}</strong>
                          <pre>{f.content}</pre>
                        </div>
                      ))}
                    </details>
                    {item.result && (
                      <pre>
                        {item.result.output}\nSaída: {item.result.exitCode ?? 'interrompida'}
                      </pre>
                    )}
                    <small>
                      Snapshot: {item.files.map((f) => f.name).join(', ') || 'sem arquivos'}
                    </small>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          const result = await window.cyroEV.execute({
                            projectId,
                            requestId: item.id,
                          });
                          if (!result.cancelled) {
                            if (result.persistenceError) setNotice(result.persistenceError);
                            else await refresh();
                          }
                          setOutput(
                            result.cancelled
                              ? 'Execução cancelada.'
                              : `${result.output}\nSaída: ${result.exitCode ?? 'interrompida'}${result.timedOut ? ' · tempo excedido' : ''}${result.outputLimited ? ' · limite de saída' : ''}`,
                          );
                        })
                      }
                    >
                      Revisar e executar
                    </button>
                    <button disabled={busy} onClick={() => void remove('execution', item.id)}>
                      Remover solicitação
                    </button>
                  </section>
                ))}
                <pre aria-label="Saída da execução" role="log">
                  {output || 'Nenhuma execução nesta sessão.'}
                </pre>
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

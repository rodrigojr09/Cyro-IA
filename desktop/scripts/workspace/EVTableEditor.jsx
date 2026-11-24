import React, { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
export function EVTableEditor({
  draft,
  onChange,
  onSave,
  onReload,
  onExport,
  busy,
  onPage,
  onDelete,
  focusRowId,
}) {
  const { columns, rows, source } = draft;
  const simple = source !== 'space';
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [draft.name]);
  const focused = React.useRef(null);
  useEffect(() => {
    if (focusRowId) focused.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusRowId, draft.offset]);
  const start = simple ? page * 50 : 0,
    visible = simple ? rows.slice(start, start + 50) : rows;
  const letter = (j) =>
    j < 26 ? String.fromCharCode(65 + j) : 'A' + String.fromCharCode(65 + j - 26);
  const change = (patch) => onChange({ ...draft, ...patch, dirty: true });
  return (
    <div className="ev-sheet">
      <div className="ev-studio-toolbar">
        <span className="ev-studio-status">
          <i className={draft.dirty ? 'dirty' : ''} />
          {draft.dirty ? 'Edições não salvas' : 'Salvo no EV'}
        </span>
        <button disabled={busy || !draft.dirty} onClick={onSave}>
          <Icon name="code-save" />
          Salvar alterações
        </button>
        <button
          disabled={busy}
          onClick={onExport}
          title={simple ? 'Criar CSV' : 'Criar CSV da página'}
        >
          <Icon name="download" />
        </button>
        <button disabled={busy} onClick={onReload} title="Recarregar tabela">
          <Icon name="refresh" />
        </button>
        {onDelete && (
          <button
            title="Remover tabela"
            aria-label="Remover tabela"
            disabled={busy || draft.dirty}
            onClick={onDelete}
          >
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="ev-sheet-scroll">
        <table aria-label="Editor da tabela">
          <thead>
            <tr>
              <th className="ev-sheet-index">#</th>
              {columns.map((c, j) => (
                <th key={j}>
                  <span className="ev-column-letter">{letter(j)}</span>
                  {simple ? (
                    <input
                      disabled={busy}
                      aria-label={`Nome da coluna ${j + 1}`}
                      value={c}
                      maxLength={80}
                      onChange={(e) =>
                        change({ columns: columns.map((v, k) => (j === k ? e.target.value : v)) })
                      }
                    />
                  ) : (
                    <span>{c}</span>
                  )}
                </th>
              ))}
              {simple && <th className="ev-sheet-actions" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, local) => {
              const i = local + start;
              return (
                <tr
                  key={draft.rowIds?.[i] || i}
                  ref={focusRowId && draft.rowIds?.[i] === focusRowId ? focused : undefined}
                  className={focusRowId && draft.rowIds?.[i] === focusRowId ? 'ev-source-row' : undefined}
                >
                  <th className="ev-sheet-index">{(draft.offset || 0) + i + 1}</th>
                  {columns.map((c, j) => (
                    <td key={j}>
                      {typeof row[j] === 'boolean' || draft.types?.[j] === 'BOOLEAN' ? (
                        <select
                          disabled={busy}
                          aria-label={`Linha ${i + 1}, coluna ${c}`}
                          value={String(row[j] ?? '')}
                          onChange={(e) =>
                            change({
                              rows: rows.map((v, k) =>
                                k === i
                                  ? v.map((cell, col) =>
                                      col === j
                                        ? e.target.value === ''
                                          ? null
                                          : e.target.value === 'true'
                                        : cell,
                                    )
                                  : v,
                              ),
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="true">Sim</option>
                          <option value="false">Não</option>
                        </select>
                      ) : (
                        <input
                          disabled={busy}
                          aria-label={`Linha ${i + 1}, coluna ${c}`}
                          value={String(row[j] ?? '')}
                          maxLength={8000}
                          onChange={(e) =>
                            change({
                              rows: rows.map((v, k) =>
                                k === i
                                  ? v.map((cell, col) =>
                                      col === j
                                        ? typeof draft.baseRows?.[i]?.[j] === 'number' &&
                                          e.target.value.trim() !== '' &&
                                          Number.isFinite(Number(e.target.value))
                                          ? Number(e.target.value)
                                          : e.target.value
                                        : cell,
                                    )
                                  : v,
                              ),
                            })
                          }
                        />
                      )}
                    </td>
                  ))}
                  {simple && (
                    <td className="ev-sheet-actions">
                      <button
                        title={`Remover linha ${i + 1}`}
                        aria-label={`Remover linha ${i + 1}`}
                        onClick={() => change({ rows: rows.filter((_, index) => index !== i) })}
                      >
                        <Icon name="trash" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="ev-sheet-footer">
        <span>
          {draft.total ?? rows.length} linhas · {columns.length} colunas
        </span>
        {simple && rows.length > 50 && (
          <>
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>
              {page + 1} / {Math.ceil(rows.length / 50)}
            </span>
            <button disabled={start + 50 >= rows.length} onClick={() => setPage(page + 1)}>
              Próximas
            </button>
          </>
        )}
        {simple ? (
          <>
            <button
              disabled={busy || rows.length >= 500}
              onClick={() => {
                change({ rows: [...rows, columns.map(() => null)] });
                setPage(Math.floor(rows.length / 50));
              }}
            >
              <Icon name="plus" />
              Linha
            </button>
            <button
              disabled={busy || columns.length >= 30}
              onClick={() =>
                change({
                  columns: [...columns, 'Coluna ' + (columns.length + 1)],
                  rows: rows.map((r) => [...r, null]),
                })
              }
            >
              <Icon name="plus" />
              Coluna
            </button>
          </>
        ) : (
          <>
            <button
              disabled={busy || draft.dirty || !draft.offset}
              onClick={() => onPage(Math.max(0, draft.offset - 50))}
            >
              Anterior
            </button>
            <button
              disabled={busy || draft.dirty || (draft.offset || 0) + rows.length >= draft.total}
              onClick={() => onPage((draft.offset || 0) + 50)}
            >
              Próximas
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

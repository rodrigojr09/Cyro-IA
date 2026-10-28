import React, { useRef, useState, useSyncExternalStore } from 'react';
import { Dialog, Markdown } from '../ui/components';
export function WriterPreview({ writer, onRun, onExpand, hidden = false }) {
  const state = useSyncExternalStore(writer.subscribe, writer.get),
    [dialog, setDialog] = useState(null),
    [revisions, setRevisions] = useState([]),
    [revision, setRevision] = useState(null),
    [expanded, setExpanded] = useState(false),
    [exportIds, setExportIds] = useState([]);
  const editor = useRef(null);
  const document = state.document;
  const disabled = state.busy || state.loading || !document || !!state.chat?.archived;
  const plan =
    state.proposal?.state === 'PENDING' && state.proposal.plan?.targetDocumentId === document?.id
      ? state.proposal.plan
      : null;
  const selected = new Set(plan?.blockIds || []);
  const rename = async () => {
    const value = await onRun.ask('Nome do arquivo', document.title);
    if (value) await writer.structure('rename', { title: value });
  };
  return (
    <aside
      className={'writer-preview' + (expanded ? ' expanded' : '')}
      hidden={!state.chat || hidden}
    >
      <header>
        <div>
          <span>PRÉVIA DO DOCUMENTO</span>
          <strong id="writer-filename">{document?.title || 'Carregando...'}</strong>
        </div>
        <button
          id="writer-edit"
          disabled={disabled || !document || document.deleted}
          aria-pressed={state.editing}
          onClick={() => onRun(() => writer.toggleEdit())}
        >
          {state.editing ? 'Concluir edição' : 'Editar'}
        </button>
        <button
          id="writer-collapse-assistant"
          aria-pressed={expanded}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            onExpand?.(next);
          }}
        >
          Ampliar
        </button>
      </header>
      <div className="writer-document-tools">
        <button
          id="writer-undo"
          disabled={disabled}
          onClick={() => onRun(() => writer.undo('undo'))}
        >
          Desfazer
        </button>
        <button
          id="writer-redo"
          disabled={disabled}
          onClick={() => onRun(() => writer.undo('redo'))}
        >
          Refazer
        </button>
        <button
          id="writer-save-file"
          hidden={!state.file?.linked}
          disabled={disabled || state.saving}
          onClick={() =>
            onRun(async () => {
              await writer.flush();
              await writer.syncFile();
            })
          }
        >
          Salvar arquivo
        </button>
        <button
          id="writer-history"
          disabled={disabled}
          onClick={() =>
            onRun(async () => {
              setRevisions(await writer.command('history', { id: document.id }));
              setDialog('history');
            })
          }
        >
          Revisões
        </button>
        <button
          id="writer-export"
          disabled={disabled}
          onClick={() => {
            setExportIds([document.id]);
            setDialog('export');
          }}
        >
          Exportar
        </button>
        <span id="writer-word-count">
          {document?.blocks
            ?.map((block) => block.text)
            .join(' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean).length || 0}{' '}
          palavras
        </span>
      </div>
      <div className="writer-file-tools">
        <button id="writer-rename" disabled={disabled} onClick={() => onRun(rename)}>
          Renomear
        </button>
        <button
          id="writer-delete"
          disabled={disabled}
          onClick={() => onRun(() => writer.structure('delete'))}
        >
          Remover
        </button>
        <button
          id="writer-duplicate"
          disabled={disabled}
          onClick={() =>
            onRun(async () => {
              await writer.flush();
              const title = await onRun.ask(
                'Nome da cópia',
                document.title.replace(/\.docx$/i, '') + ' cópia.docx',
              );
              if (!title) return;
              const copy = await writer.command('create', {
                title,
                kind: document.kind,
                parentId: document.parent,
              });
              await writer.command('save', {
                id: copy.id,
                base_version: copy.version,
                blocks: document.blocks.map((block) => ({ ...block, id: crypto.randomUUID() })),
                request_id: crypto.randomUUID(),
              });
              writer.set({ status: 'Cópia salva no projeto.' });
            })
          }
        >
          Duplicar
        </button>
        <button id="writer-move" disabled={disabled} onClick={() => setDialog('move')}>
          Mover
        </button>
        <button id="writer-settings" onClick={() => setDialog('settings')}>
          Preferências
        </button>
      </div>
      <p id="writer-save-state" role="status">
        {state.saving
          ? 'Salvando…'
          : state.dirty
            ? 'Edição ou proposta pendente'
            : state.file?.linked && state.file.saved_version !== document?.version
              ? 'Salvo no Cyro · salvar arquivo original'
              : 'Salvo'}
      </p>
      {state.error && (
        <>
          <p role="status">{state.error}</p>
          <button id="writer-retry" onClick={() => onRun(() => writer.flush())}>
            Tentar salvar
          </button>
          <button id="writer-compare-save" onClick={() => setDialog('compare')}>
            Comparar edição
          </button>
        </>
      )}
      <button
        id="writer-reload"
        hidden={state.proposal?.state !== 'CONFLICTED'}
        onClick={() => onRun(() => writer.reload())}
      >
        Recarregar documento
      </button>
      <p id="writer-preview-notice">
        {plan ? 'Azul = proposta ainda não aplicada. Trechos riscados serão removidos.' : ''}
      </p>
      <nav id="writer-outline" aria-label="Seções do documento">
        {document?.blocks
          ?.filter((block) => block.type.startsWith('heading'))
          .map((block) => (
            <button
              key={block.id}
              onClick={() =>
                globalThis.document
                  .getElementById('writer-block-' + block.id)
                  ?.scrollIntoView({ block: 'start' })
              }
            >
              {block.text.slice(0, 80)}
            </button>
          ))}
      </nav>
      <div
        id="writer-paper"
        tabIndex={0}
        onMouseUp={() => {
          if (state.editing) return;
          const selection = window.getSelection();
          if (!selection?.toString().trim()) {
            writer.select([], '');
            return;
          }
          const range = selection.getRangeAt(0);
          const paper = globalThis.document.getElementById('writer-paper');
          if (!paper.contains(range.commonAncestorContainer)) return;
          const ids = [...paper.querySelectorAll('[data-block]')]
            .filter((node) => range.intersectsNode(node))
            .map((node) => node.dataset.block);
          if (ids.length) writer.select(ids, selection.toString());
        }}
      >
        {!document ? (
          'Carregando documento...'
        ) : document.deleted ? (
          <p>Arquivo removido. Use Desfazer para recuperar.</p>
        ) : (
          <>
            <h1>{document.title.replace(/\.(docx|md|txt)$/i, '')}</h1>
            {document.blocks.map((block) =>
              state.editing ? (
                <div
                  key={block.id}
                  className={
                    'writer-block-editor' +
                    (state.selectedIds.includes(block.id) ? ' writer-selected' : '')
                  }
                  data-block={block.id}
                >
                  <select
                    aria-label="Formato do bloco"
                    value={block.type}
                    disabled={disabled}
                    onChange={(event) =>
                      writer.edit(
                        document.blocks.map((item) =>
                          item.id === block.id ? { ...item, type: event.target.value } : item,
                        ),
                      )
                    }
                  >
                    {Object.entries({
                      paragraph: 'Parágrafo',
                      heading1: 'Título',
                      heading2: 'Subtítulo',
                      bullet: 'Lista',
                      number: 'Lista numerada',
                      pagebreak: 'Quebra de página',
                    }).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    aria-label="Texto do bloco"
                    onFocus={(event) => {
                      editor.current = event.currentTarget;
                    }}
                    data-block={block.id}
                    value={block.text}
                    maxLength={12000}
                    rows={Math.min(12, Math.max(2, block.text.split('\n').length))}
                    disabled={disabled}
                    onChange={(event) =>
                      writer.edit(
                        document.blocks.map((item) =>
                          item.id === block.id ? { ...item, text: event.target.value } : item,
                        ),
                      )
                    }
                    onSelect={(event) => {
                      const input = event.target;
                      if (input.selectionEnd > input.selectionStart)
                        writer.select(
                          [block.id],
                          input.value.slice(input.selectionStart, input.selectionEnd),
                        );
                      else if (globalThis.document.activeElement === input) writer.select([], '');
                    }}
                  />
                  <button
                    disabled={disabled}
                    onClick={() =>
                      writer.edit(document.blocks.filter((item) => item.id !== block.id))
                    }
                  >
                    Remover bloco
                  </button>
                </div>
              ) : (
                <div
                  key={block.id}
                  id={'writer-block-' + block.id}
                  data-block={block.id}
                  className={
                    'writer-block ' +
                    (state.selectedIds.includes(block.id) ? 'writer-selected ' : '') +
                    (plan?.operation === 'delete' ||
                    (plan?.operation === 'replace' && selected.has(block.id))
                      ? 'writer-removed'
                      : '')
                  }
                >
                  <Markdown
                    text={
                      (block.type === 'heading1'
                        ? '# '
                        : block.type === 'heading2'
                          ? '## '
                          : block.type === 'bullet'
                            ? '- '
                            : block.type === 'number'
                              ? '1. '
                              : '') + block.text
                    }
                  />
                </div>
              ),
            )}
            {plan?.blocks?.length > 0 && (
              <div className="writer-change">
                {plan.blocks.map((block, index) => (
                  <mark key={block.id || index}>
                    <Markdown text={block.text} />
                  </mark>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div id="writer-edit-tools" hidden={!state.editing}>
        <button
          id="writer-add-block"
          disabled={disabled}
          onClick={() =>
            writer.edit([
              ...document.blocks,
              { id: crypto.randomUUID(), type: 'paragraph', text: '' },
            ])
          }
        >
          ＋ Parágrafo
        </button>
        {[
          ['writer-bold', 'Negrito', '**'],
          ['writer-italic', 'Itálico', '*'],
        ].map(([id, label, marker]) => (
          <button
            key={id}
            id={id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const field = editor.current;
              if (!field) return;
              const start = field.selectionStart,
                end = field.selectionEnd;
              if (start === end) return;
              writer.edit(
                document.blocks.map((block) =>
                  block.id === field.dataset.block
                    ? {
                        ...block,
                        text:
                          block.text.slice(0, start) +
                          marker +
                          block.text.slice(start, end) +
                          marker +
                          block.text.slice(end),
                      }
                    : block,
                ),
              );
              requestAnimationFrame(() => {
                field.focus();
                field.setSelectionRange(start + marker.length, end + marker.length);
              });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <Dialog
        id="writer-history-dialog"
        title="Revisões"
        open={dialog === 'history'}
        onClose={() => setDialog(null)}
      >
        <div id="writer-revisions">
          {revisions.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                onRun(async () => {
                  setRevision({
                    ...(await writer.command('revision', {
                      id: document.id,
                      revision_id: Number(item.id),
                    })),
                    id: item.id,
                  });
                  setDialog('revision');
                })
              }
            >
              {item.label || item.operation || 'Revisão'} · {item.created_at || item.createdAt}
            </button>
          ))}
        </div>
      </Dialog>
      <Dialog
        id="writer-revision-dialog"
        title="Comparar revisão"
        open={dialog === 'revision'}
        onClose={() => setDialog(null)}
      >
        <pre>{revision?.after?.blocks?.map((block) => block.text).join('\n\n')}</pre>
        <button
          id="writer-restore"
          disabled={disabled}
          onClick={() =>
            onRun(async () => {
              if (
                (await onRun.ask('Restaurar versão', '', 'Digite RESTAURAR para confirmar.')) !==
                'RESTAURAR'
              )
                return;
              await writer.command('restore', {
                id: document.id,
                revision_id: Number(revision.id),
                base_version: document.version,
              });
              await writer.reload();
              await writer.syncFile();
              setDialog(null);
            })
          }
        >
          Restaurar revisão
        </button>
      </Dialog>
      <Dialog
        id="writer-export-dialog"
        title="Exportar documentos"
        open={dialog === 'export'}
        onClose={() => setDialog(null)}
      >
        <p>Escolha os documentos e o formato. O destino será escolhido na janela do Windows.</p>
        <div id="writer-export-items">
          {state.catalog?.nodes
            ?.filter((node) => node.kind !== 'folder' && !node.deleted)
            .map((node) => (
              <label key={node.id}>
                <input
                  type="checkbox"
                  checked={exportIds.includes(node.id)}
                  onChange={(event) =>
                    setExportIds((value) =>
                      event.target.checked
                        ? [...value, node.id]
                        : value.filter((id) => id !== node.id),
                    )
                  }
                />
                {node.title}
              </label>
            ))}
        </div>
        {['docx', 'md', 'txt'].map((format) => (
          <button
            key={format}
            id={'writer-export-' + format}
            disabled={!exportIds.length}
            onClick={() =>
              onRun(async () => {
                await writer.flush();
                await window.jarvisWriter.export({
                  project_id: state.project.id,
                  document_ids: exportIds,
                  format,
                });
                setDialog(null);
              })
            }
          >
            Exportar {format.toUpperCase()}
          </button>
        ))}
      </Dialog>
      <Dialog
        id="writer-compare-dialog"
        title="Recuperação da edição"
        open={dialog === 'compare'}
        onClose={() => setDialog(null)}
      >
        <p>
          O texto abaixo continua neste aplicativo. Copie antes de recarregar para preservar sua
          edição.
        </p>
        <pre>{document?.blocks?.map((block) => block.text).join('\n\n')}</pre>
        <button
          onClick={() =>
            onRun(() =>
              window.jarvisWindow.copyCode(document.blocks.map((block) => block.text).join('\n\n')),
            )
          }
        >
          Copiar edição
        </button>
      </Dialog>
      <Dialog
        id="writer-move-dialog"
        title="Mover documento"
        open={dialog === 'move'}
        onClose={() => setDialog(null)}
      >
        <p>A movimentação será proposta para sua aprovação.</p>
        <button
          onClick={() =>
            onRun(async () => {
              await writer.structure('move', {
                parentId: null,
                position: state.catalog.nodes.length + 1,
              });
              setDialog(null);
            })
          }
        >
          Raiz do projeto
        </button>
        {state.catalog?.nodes
          ?.filter((node) => node.kind === 'folder' && !node.deleted)
          .map((node) => (
            <button
              key={node.id}
              onClick={() =>
                onRun(async () => {
                  await writer.structure('move', {
                    parentId: node.id,
                    position: state.catalog.nodes.length + 1,
                  });
                  setDialog(null);
                })
              }
            >
              {node.title}
            </button>
          ))}
      </Dialog>
      <WriterSettings
        state={state}
        writer={writer}
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        onRun={onRun}
      />
    </aside>
  );
}
function WriterSettings({ state, writer, open, onClose, onRun }) {
  const [settings, setSettings] = useState(null);
  React.useEffect(() => {
    if (open) setSettings(state.catalog?.settings);
  }, [open]);
  return (
    <Dialog
      id="writer-settings-dialog"
      title="Preferências do Cyro IA Writer"
      open={open}
      onClose={onClose}
    >
      {settings && (
        <>
          <label>
            <input
              id="writer-consent"
              type="checkbox"
              checked={settings.cloud_consent}
              onChange={(event) =>
                setSettings({ ...settings, cloud_consent: event.target.checked })
              }
            />
            Autorizo o envio dos trechos necessários à IA Cloud
          </label>
          <label>
            <input
              id="writer-auto"
              type="checkbox"
              checked={settings.auto_write}
              onChange={(event) => setSettings({ ...settings, auto_write: event.target.checked })}
            />
            Permitir inserções inequívocas com tempo para cancelar
          </label>
          <label>
            <input
              id="writer-linguistic"
              type="checkbox"
              checked={settings.linguistic}
              onChange={(event) => setSettings({ ...settings, linguistic: event.target.checked })}
            />
            Correções linguísticas
          </label>
          <label>
            Estilo
            <input
              id="writer-style"
              value={settings.style}
              onChange={(event) => setSettings({ ...settings, style: event.target.value })}
            />
          </label>
          <label>
            Tempo para cancelar
            <input
              id="writer-delay"
              type="number"
              min={3}
              max={60}
              value={settings.cancel_seconds}
              onChange={(event) =>
                setSettings({ ...settings, cancel_seconds: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Retenção de revisões
            <input
              id="writer-retention"
              type="number"
              min={1}
              value={settings.retention}
              onChange={(event) =>
                setSettings({ ...settings, retention: Number(event.target.value) })
              }
            />
          </label>
          <button
            id="writer-settings-save"
            onClick={() =>
              onRun(async () => {
                const result = await writer.command('settings', settings);
                writer.set({ catalog: { ...state.catalog, settings: result } });
                onClose();
              })
            }
          >
            Salvar preferências
          </button>
          <button
            id="writer-prune"
            onClick={() =>
              onRun(async () => {
                if ((await onRun.ask('Limpar revisões manuais antigas', '')) !== 'LIMPAR') return;
                await writer.command('prune', { confirmed: true });
              })
            }
          >
            Limpar revisões antigas
          </button>
        </>
      )}
    </Dialog>
  );
}
export function WriterProposal({ writer, onRun }) {
  const state = useSyncExternalStore(writer.subscribe, writer.get),
    [adjusting, setAdjusting] = useState(false),
    [text, setText] = useState('');
  const proposal = state.proposal;
  if (!proposal) return null;
  const pending = proposal.state === 'PENDING';
  return (
    <section id="writer-proposal">
      <div>
        <span id="writer-intent-badge">{proposal.intent || proposal.plan?.operation}</span>
        <strong id="writer-proposal-title">{proposal.title || 'Revise a proposta'}</strong>
      </div>
      <p id="writer-proposal-reason">{proposal.reason || proposal.explanation}</p>
      <p id="writer-countdown" role="status">
        {state.remaining > 0
          ? 'Inserção inequívoca em ' + state.remaining + ' s. Rejeite para cancelar.'
          : proposal.state === 'CONFLICTED'
            ? 'Conflito: peça uma proposta atualizada.'
            : ''}
      </p>
      <div className="writer-proposal-actions">
        <button
          id="writer-approve"
          disabled={!pending || state.busy || state.chat?.archived}
          onClick={() => onRun(() => writer.decide(true))}
        >
          Aprovar alteração
        </button>
        <button
          id="writer-reject"
          disabled={!pending || state.busy}
          onClick={() => onRun(() => writer.decide(false))}
        >
          Rejeitar
        </button>
        <button
          id="writer-adjust"
          disabled={!pending || state.busy}
          onClick={() => {
            setText(proposal.plan?.blocks?.map((block) => block.text).join('\n\n') || '');
            setAdjusting(true);
          }}
        >
          Ajustar
        </button>
      </div>
      {adjusting && (
        <div id="writer-adjust-area">
          <label>
            Proposta editável
            <textarea
              id="writer-adjust-text"
              maxLength={12000}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <button
            id="writer-apply-adjusted"
            onClick={() =>
              onRun(async () => {
                await writer.decide(
                  true,
                  false,
                  text.split(/\n\s*\n/).map((content) => ({
                    id: crypto.randomUUID(),
                    type: 'paragraph',
                    text: content,
                  })),
                );
                setAdjusting(false);
              })
            }
          >
            Aplicar texto ajustado
          </button>
        </div>
      )}
    </section>
  );
}

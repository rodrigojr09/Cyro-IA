import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { extensions, toDocument, editorBlocks, connectEditor, nodeText } from './editor';
import { Dialog, Markdown } from '../ui/components';
import { AnchoredMenu } from '../ui/AnchoredMenu';
export function WriterPreview({ writer, onRun, hidden = false }) {
  const state = useSyncExternalStore(writer.subscribe, writer.get),
    [dialog, setDialog] = useState(null),
    [fileMenu, setFileMenu] = useState(null),
    [revisions, setRevisions] = useState([]),
    [revision, setRevision] = useState(null),
    [prefs, setPrefs] = useState(null);
  const doc = state.document,
    disabled = !doc || state.loading || state.saving || state.applying;
  const history = () =>
    onRun(async () => {
      await writer.flush();
      setRevisions(await writer.command('history', { id: doc.id }));
      setDialog('history');
    });
  const exportFile = (format, recovery = false) =>
    onRun(async () => {
      if (!recovery) await writer.flush();
      await window.jarvisWriter.export({
        project_id: state.project.id,
        document_ids: [doc.id],
        format,
        ...(recovery ? { draft: structuredClone(doc.blocks) } : {}),
      });
      setDialog(null);
    });
  return (
    <aside
      className="writer-preview continuous-writer"
      hidden={hidden || !state.chat}
      aria-label="Documento"
    >
      <header className="writer-document-heading">
        <div>
          <span>DOCUMENTO</span>
          <strong id="writer-filename">{doc?.title || 'Carregando…'}</strong>
        </div>
        <span id="writer-save-state" role="status">
          {state.saving ? 'Salvando…' : state.unsynced ? 'Alterações pendentes' : 'Salvo'}
        </span>
        <button
          className="writer-file-menu"
          aria-haspopup="menu"
          aria-expanded={!!fileMenu}
          onClick={(event) => {
            const trigger = event.currentTarget;
            const rect = trigger.getBoundingClientRect();
            setFileMenu(
              fileMenu
                ? null
                : {
                    kind: 'writer',
                    label: 'Arquivo do documento',
                    placement: 'below-end',
                    trigger,
                    anchor: {
                      left: rect.left,
                      right: rect.right,
                      top: rect.top,
                      bottom: rect.bottom,
                    },
                  },
            );
          }}
        >
          Arquivo
        </button>
        {fileMenu && (
          <AnchoredMenu menu={fileMenu} onClose={() => setFileMenu(null)}>
            <div
              className="writer-menu-items"
              onClick={(event) => {
                if (event.target.closest('button:not(:disabled)')) setFileMenu(null);
              }}
            >
              <button role="menuitem" id="writer-history" disabled={disabled} onClick={history}>
                Versões salvas
              </button>
              <button
                role="menuitem"
                id="writer-export"
                disabled={disabled}
                onClick={() => setDialog('export')}
              >
                Exportar
              </button>
              <button
                role="menuitem"
                id="writer-settings"
                disabled={disabled}
                onClick={() => {
                  setPrefs(state.catalog?.settings);
                  setDialog('settings');
                }}
              >
                Preferências
              </button>
              <button
                role="menuitem"
                id="writer-save-file"
                hidden={!state.file?.linked}
                disabled={disabled}
                onClick={() =>
                  onRun(async () => {
                    await writer.flush();
                    await writer.syncFile();
                  })
                }
              >
                Sincronizar arquivo vinculado
              </button>
            </div>
          </AnchoredMenu>
        )}
      </header>
      {doc && !state.loading && (
        <RichEditor
          key={doc.id}
          writer={writer}
          document={doc}
          readOnly={!!doc.deleted || !!state.chat?.archived || !!state.applying}
          onRun={onRun}
        />
      )}
      {state.error && (
        <section className="writer-recovery" role="alert">
          <p>{state.error}</p>
          <button id="writer-retry-save" onClick={() => onRun(writer.flush)}>
            Tentar salvar
          </button>
          <button onClick={() => exportFile('docx', true)}>Exportar recuperação</button>
          <button
            onClick={() =>
              onRun(() => window.jarvisWindow.copyCode(doc.blocks.map((b) => b.text).join('\n\n')))
            }
          >
            Copiar edição
          </button>
          <button
            id="writer-reload"
            onClick={() =>
              onRun(async () => {
                if (
                  state.dirty &&
                  (await onRun.ask(
                    'Recarregar versão salva',
                    '',
                    'Digite RECARREGAR para descartar a edição local. Copie ou exporte antes.',
                  )) !== 'RECARREGAR'
                )
                  return;
                await writer.reload();
              })
            }
          >
            Comparar com versão salva / recarregar
          </button>
        </section>
      )}
      <Dialog
        id="writer-history-dialog"
        title="Versões salvas"
        open={dialog === 'history'}
        onClose={() => setDialog(null)}
      >
        <p>
          Checkpoints persistidos são diferentes do histórico de operações do editor e das mensagens
          do chat.
        </p>
        <div id="writer-revisions">
          {revisions.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                onRun(async () => {
                  setRevision({
                    ...(await writer.command('revision', { id: doc.id, revision_id: item.id })),
                    id: item.id,
                  });
                  setDialog('revision');
                })
              }
            >
              Versão {item.version} · {item.source} · {item.operation} · {item.created}
            </button>
          ))}
        </div>
      </Dialog>
      <Dialog
        id="writer-revision-dialog"
        title="Restaurar versão"
        open={dialog === 'revision'}
        onClose={() => setDialog(null)}
      >
        <pre>{revision?.after?.blocks?.map((b) => b.text).join('\n\n')}</pre>
        <button
          id="writer-restore"
          disabled={disabled}
          onClick={() =>
            onRun(async () => {
              if (
                (await onRun.ask(
                  'Restaurar versão',
                  '',
                  'Digite RESTAURAR. A versão atual será preservada no histórico.',
                )) !== 'RESTAURAR'
              )
                return;
              await writer.flush();
              await writer.command('restore', {
                id: doc.id,
                base_version: writer.get().document.version,
                revision_id: revision.id,
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
        title="Exportar documento"
        open={dialog === 'export'}
        onClose={() => setDialog(null)}
      >
        <p>O destino será escolhido na janela do Windows.</p>
        {['docx', 'md', 'txt'].map((format) => (
          <button key={format} id={'writer-export-' + format} onClick={() => exportFile(format)}>
            {format.toUpperCase()}
          </button>
        ))}
      </Dialog>
      <Dialog
        id="writer-settings-dialog"
        title="Preferências do Cyro IA Writer"
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
      >
        {prefs && (
          <>
            <label>
              <input
                id="writer-consent"
                type="checkbox"
                checked={prefs.cloud_consent}
                onChange={(e) => setPrefs({ ...prefs, cloud_consent: e.target.checked })}
              />
              Autorizo enviar os trechos necessários ao mesmo Cyro na nuvem
            </label>
            <label>
              Preferência de escrita
              <input
                id="writer-style"
                value={prefs.style}
                maxLength={2000}
                onChange={(e) => setPrefs({ ...prefs, style: e.target.value })}
              />
            </label>
            <label>
              Retenção de versões
              <input
                type="number"
                min={10}
                max={2000}
                value={prefs.retention}
                onChange={(e) => setPrefs({ ...prefs, retention: Number(e.target.value) })}
              />
            </label>
            <button
              id="writer-settings-save"
              onClick={() =>
                onRun(async () => {
                  const settings = await writer.command('settings', {
                    ...prefs,
                    auto_write: false,
                  });
                  writer.set({ catalog: { ...state.catalog, settings } });
                  setDialog(null);
                })
              }
            >
              Salvar preferências
            </button>
          </>
        )}
      </Dialog>
    </aside>
  );
}
function RichEditor({ writer, document: documentValue, readOnly, onRun }) {
  const connected = useRef(null),
    applying = useRef(false),
    initial = useRef(null);
  if (!initial.current)
    initial.current = { extensions: extensions(), content: toDocument(documentValue.blocks) };
  const editor = useEditor(
    {
      extensions: initial.current.extensions,
      content: initial.current.content,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: 'cyro-document-editor',
          role: 'textbox',
          'aria-label': 'Conteúdo do documento',
          'aria-multiline': 'true',
          spellcheck: 'true',
        },
      },
      onUpdate: ({ editor }) => {
        if (!applying.current && !connected.current?.adapter.remote)
          writer.edit(editorBlocks(editor));
      },
      onSelectionUpdate: ({ editor }) => {
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          writer.select([], '');
          return;
        }
        const ranges = [];
        editor.state.doc.forEach((node, pos) => {
          if (from >= pos + node.nodeSize || to <= pos || node.isLeaf) return;
          const left = Math.max(0, from - pos - 1),
            right = Math.min(node.content.size, to - pos - 1);
          if (right < left) return;
          const start = Array.from(node.textBetween(0, left, '\n', '\n')).length;
          const end = Array.from(node.textBetween(0, right, '\n', '\n')).length;
          const text = Array.from(nodeText(node.toJSON())).slice(start, end).join('');
          if (text) ranges.push({ block_id: node.attrs.id, start, end, text });
        });
        writer.select(
          ranges.map((r) => r.block_id),
          editor.state.doc.textBetween(from, to, '\n', '\n'),
          ranges.length === 1 ? ranges[0] : ranges,
        );
      },
    },
    [],
  );
  useEffect(() => {
    if (!editor) return;
    connected.current = connectEditor(editor, writer);
    const preserve = () => writer.preserve();
    window.addEventListener('beforeunload', preserve);
    return () => {
      preserve();
      connected.current?.dispose();
      connected.current = null;
      window.removeEventListener('beforeunload', preserve);
    };
  }, [editor, writer]);
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);
  useEffect(() => {
    if (editor && connected.current) {
      applying.current = true;
      try {
        connected.current.adapter.apply(documentValue.blocks);
      } finally {
        applying.current = false;
      }
    }
  }, [editor, documentValue]);
  if (!editor) return null;
  const run = (command) => {
    if (!readOnly) editor.chain().focus()[command]().run();
  };
  return (
    <>
      <div
        className="writer-formatting"
        aria-label="Formatação do documento"
        onMouseDown={(event) => {
          if (event.target.closest('button')) event.preventDefault();
        }}
      >
        <select
          aria-label="Estilo de parágrafo"
          defaultValue="paragraph"
          disabled={readOnly}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'paragraph') editor.chain().focus().setParagraph().run();
            else if (value === 'bullet') editor.chain().focus().toggleBulletList().run();
            else if (value === 'number') editor.chain().focus().toggleOrderedList().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(value) })
                .run();
          }}
        >
          <option value="paragraph">Texto normal</option>
          {[1, 2, 3].map((level) => (
            <option key={level} value={level}>
              Título {level}
            </option>
          ))}
          <option value="bullet">Lista com marcadores</option>
          <option value="number">Lista numerada</option>
        </select>
        {[
          ['toggleBold', 'Negrito', 'B'],
          ['toggleItalic', 'Itálico', 'I'],
          ['toggleUnderline', 'Sublinhado', 'U'],
        ].map(([command, label, text]) => (
          <button key={command} aria-label={label} disabled={readOnly} onClick={() => run(command)}>
            {text}
          </button>
        ))}
        <select
          aria-label="Alinhamento"
          defaultValue="left"
          disabled={readOnly}
          onChange={(e) => editor.chain().focus().setTextAlign(e.target.value).run()}
        >
          {[
            ['left', 'Esquerda'],
            ['center', 'Centro'],
            ['right', 'Direita'],
            ['justify', 'Justificado'],
          ].map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        <button
          aria-label="Inserir ou remover link"
          disabled={readOnly}
          onClick={() =>
            onRun(async () => {
              const href = await onRun.ask(
                'Endereço do link',
                editor.getAttributes('link').href || '',
                'Use HTTPS, HTTP ou mailto. Deixe vazio para remover.',
              );
              if (href === null) return;
              if (!href) {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                return;
              }
              const url = new URL(href);
              if (
                !['https:', 'http:', 'mailto:'].includes(url.protocol) ||
                url.username ||
                url.password
              )
                throw Error('Endereço inválido.');
              editor.chain().focus().setLink({ href }).run();
            })
          }
        >
          Link
        </button>
        <details>
          <summary>Inserir</summary>
          <button
            disabled={readOnly}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            Tabela
          </button>
          <button
            disabled={readOnly}
            onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()}
          >
            Quebra de página
          </button>
        </details>
      </div>
      <div id="writer-paper">
        <EditorContent editor={editor} />
      </div>
    </>
  );
}
export function WriterProposal({ writer, onRun }) {
  const state = useSyncExternalStore(writer.subscribe, writer.get),
    proposal = state.proposal;
  if (!proposal) return null;
  const pending = proposal.state === 'PENDING';
  return (
    <section id="writer-proposal" aria-label="Revisão proposta">
      <strong>Proposta do Cyro</strong>
      <p id="writer-countdown" role="status">
        {proposal.state === 'CONFLICTED'
          ? 'Conflito: o documento mudou. Peça uma nova proposta.'
          : 'O documento só será alterado após sua aprovação.'}
      </p>
      <div className="writer-proposal-text">
        <Markdown
          text={
            proposal.plan?.blocks?.map((b) => b.text).join('\n\n') || proposal.plan?.operation || ''
          }
        />
      </div>
      <button
        id="writer-approve"
        disabled={!pending || state.busy}
        onClick={() => onRun(() => writer.decide(true))}
      >
        Aprovar alteração
      </button>
      <button
        id="writer-reject"
        disabled={!pending || state.busy}
        onClick={() => onRun(() => writer.decide(false))}
      >
        Descartar proposta
      </button>
    </section>
  );
}
export function WriterDivider() {
  const drag = useRef(false);
  const adjust = (element, width) => {
    const root = element.parentElement;
    root.style.setProperty(
      '--writer-chat-width',
      Math.max(280, Math.min(root.clientWidth * 0.6, width)) + 'px',
    );
  };
  return (
    <div
      className="writer-divider"
      role="separator"
      aria-label="Redimensionar chat lateral"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          adjust(
            e.currentTarget,
            e.currentTarget.parentElement.getBoundingClientRect().right - e.clientX,
          );
      }}
      onPointerUp={() => {
        drag.current = false;
      }}
      onKeyDown={(e) => {
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          adjust(
            e.currentTarget,
            e.currentTarget.parentElement.querySelector('.writer-standard-chat').clientWidth +
              (e.key === 'ArrowLeft' ? 24 : -24),
          );
        }
      }}
    />
  );
}

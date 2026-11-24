import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { AnchoredMenu, contextMenuAt, contextMenuHandlers } from '../ui/AnchoredMenu';
import { publicError } from '../shared/bridge';
import { EVNotes } from './EVNotes';
import { EVCodeEditor } from './EVCodeEditor';
import { EVTableEditor } from './EVTableEditor';
import { EVPreview } from './EVPreview';
import {
  languageFor,
  filenameFor,
  safeFilename,
  uniqueFilename,
  csvFor,
  executionLabel,
} from './studio-model';
const empty = () => ({
  revision: 0,
  files: [],
  tables: [],
  executions: [],
  panel: null,
  preview: null,
});
const uid = () => crypto.randomUUID();
const keyFor = (p) => p.kind + ':' + (p.source || 'workbench') + ':' + p.target;
const categories = [
  ['code', 'Códigos', 'code'],
  ['table', 'Tabelas', 'table'],
  ['document', 'Documentos', 'folder'],
  ['preview', 'Terminal', 'terminal'],
];
function typedCell(value, type) {
  if (value === null || value === '') return null;
  if (type === 'NUMBER') {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw Error('Use números inteiros nesta coluna.');
    return number;
  }
  if (type === 'BOOLEAN') return value === true || value === 'true';
  if (type === 'DECIMAL' || type === 'CURRENCY') return String(value).replace(',', '.');
  return String(value);
}
export const EVStudio = forwardRef(function EVStudio(
  {
    projectId,
    hidden,
    visible,
    refreshKey,
    request,
    onOpen = () => {},
    onClose = () => {},
    onPending = () => {},
    onUse,
    renderFiscal,
    renderAnalysis,
  },
  ref,
) {
  const [workbench, setWorkbench] = useState(empty),
    [tables, setTables] = useState([]),
    [tableNext, setTableNext] = useState(null),
    [pane, setPane] = useState(null),
    [category, setCategory] = useState(null),
    [resourceRefresh, setResourceRefresh] = useState(0),
    [drafts, setDrafts] = useState({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [runtime, setRuntime] = useState('shell'),
    [command, setCommand] = useState('ls -la'),
    [localResults, setLocalResults] = useState({}),
    [ready, setReady] = useState(false),
    [retry, setRetry] = useState(0),
    [previewMode, setPreviewMode] = useState('auto');
  const [resourceMenu, setResourceMenu] = useState(null);
  useEffect(() => setResourceMenu(null), [projectId, hidden, visible, category, pane, search]);
  const resourceHandlers = (name, items) => contextMenuHandlers((event) =>
    setResourceMenu({ ...contextMenuAt(event, 'Ações de ' + name), items }),
  );
  const wb = useRef(empty()),
    draftRef = useRef({}),
    seen = useRef(null),
    active = useRef(true),
    working = useRef(false),
    booted = useRef(false),
    currentPane = useRef(null);
  currentPane.current = pane;
  const changeDrafts = (fn) => {
    const next = fn(draftRef.current);
    draftRef.current = next;
    setDrafts(next);
  };
  const reveal = (next) => {
    if (!active.current) return;
    setCategory(next.kind);
    setPane(next);
    onOpen();
  };
  const setDraft = (key, value) => changeDrafts((old) => ({ ...old, [key]: value }));
  const dropDraft = (key) =>
    changeDrafts((old) => Object.fromEntries(Object.entries(old).filter(([k]) => k !== key)));
  async function choose(next, state = wb.current, offset = 0) {
    if (next.kind === 'closed') {
      setPane(null);
      return;
    }
    const key = keyFor(next),
      existing = draftRef.current[key];
    if (next.kind === 'code') {
      const file = state.files.find((f) => f.name === next.target);
      if (!existing?.dirty) {
        if (!file) throw Error('Arquivo indisponível. Atualize os arquivos do EV.');
        setDraft(key, {
          name: file.name,
          originalName: file.name,
          target: file.name,
          content: file.content,
          baseContent: file.content,
          entityRevision: file.revision || 0,
          dirty: false,
        });
      }
    }
    if (next.kind === 'table' && !existing?.dirty) {
      if (next.source === 'space') {
        const out = await request({
          action: 'table.read',
          projectId,
          id: next.target,
          offset,
          limit: 50,
          ...(next.rowId && offset === 0 ? { focusRowId: next.rowId } : {}),
        });
        if (!active.current) return;
        const columns = out.table.columns;
        const rows = out.rows.map((r) => columns.map((c) => r.data[c.id] ?? null));
        setDraft(key, {
          name: out.table.name,
          source: 'space',
          columns: columns.map((c) => c.name),
          columnIds: columns.map((c) => c.id),
          types: columns.map((c) => c.type),
          rows,
          baseRows: structuredClone(rows),
          rowIds: out.rows.map((r) => r.id),
          entityRevision: out.table.revision,
          total: out.table.rowCount,
          offset: out.offset ?? offset,
          dirty: false,
        });
      } else {
        const table = state.tables.find((t) => t.name === next.target);
        if (!table) throw Error('Tabela indisponível.');
        setDraft(key, {
          ...structuredClone(table),
          source: 'workbench',
          baseRows: structuredClone(table.rows),
          entityRevision: table.revision || 0,
          dirty: false,
        });
      }
    }
    reveal(next);
  }
  function apply(next, follow = true) {
    if (!active.current) return;
    if (next.revision < wb.current.revision) return;
    wb.current = next;
    setWorkbench(next);
    const intent = next.panel;
    if (follow && intent?.token && intent.token !== seen.current) {
      seen.current = intent.token;
      void choose(intent, next).catch((e) => setNotice(publicError(e)));
    }
  }
  async function refresh(follow = true) {
    const [studio, list] = await Promise.allSettled([
      request({ action: 'workbench.list', projectId }),
      request({ action: 'tables.list', projectId, limit: 100, offset: 0 }),
    ]);
    if (!active.current) return;
    if (studio.status === 'rejected') throw studio.reason;
    apply(studio.value, follow);
    if (list.status === 'fulfilled') {
      setTables(list.value.tables || []);
      setTableNext(list.value.next ?? null);
    }
    return studio.value;
  }
  async function operation(action, fields = {}) {
    const next = await request({
      action,
      projectId,
      operationId: uid(),
      expectedRevision: wb.current.revision,
      ...fields,
    });
    apply(next);
    return next;
  }
  async function perform(fn) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setNotice('');
    onOpen();
    try {
      return await fn();
    } catch (e) {
      if (active.current) setNotice(publicError(e));
      return null;
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onPending(false);
    };
  }, [projectId]);
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    if (!booted.current) {
      void Promise.all([
        request({ action: 'workbench.list', projectId }),
        Promise.resolve(
          window.cyroEV?.draft?.({ projectId, channel: 'IDE', operation: 'read' }) || null,
        ).catch((e) => {
          if (alive) setNotice(publicError(e));
          return null;
        }),
      ])
        .then(async ([state, stored]) => {
          if (!alive || !active.current) return;
          if (stored?.studioVersion === 9 && stored.drafts) {
            draftRef.current = stored.drafts;
            setDrafts(stored.drafts);
          } else if (stored?.name && typeof stored.content === 'string') {
            const current = state.files.find((f) => f.name === stored.name);
            const name = uniqueFilename(
              state.files,
              stored.name,
              stored.content,
              current?.content === stored.content,
            );
            const panel = { kind: 'code', target: name, source: 'workbench' };
            const recovered = {
              [keyFor(panel)]: {
                name,
                originalName: current?.content === stored.content ? name : null,
                target: name,
                content: stored.content,
                baseContent: current?.content === stored.content ? stored.content : '',
                entityRevision: current?.content === stored.content ? current.revision || 0 : -1,
                dirty: current?.content !== stored.content,
              },
            };
            draftRef.current = recovered;
            setDrafts(recovered);
            setNotice(
              current?.content === stored.content
                ? 'Seu código já está salvo no EV.'
                : 'Rascunho recuperado como cópia. O arquivo salvo no EV foi preservado.',
            );
          }
          booted.current = true;
          setReady(true);
          const dirtyKey = Object.keys(draftRef.current).find((key) => draftRef.current[key].dirty);
          if (dirtyKey) {
            seen.current = state.panel?.token || null;
            apply(state, false);
            const [kind, source, target] = dirtyKey.split(':');
            reveal({ kind, source, target });
          } else apply(state);
          await refresh(false);
          if (currentPane.current && ['code', 'table'].includes(currentPane.current.kind))
            await choose(currentPane.current, wb.current);
        })
        .catch((e) => {
          if (alive) setNotice(publicError(e));
        });
    } else void refresh().catch((e) => setNotice(publicError(e)));
    return () => {
      alive = false;
    };
  }, [projectId, hidden, refreshKey, retry]);
  useEffect(() => {
    if (hidden) return;
    const focus = () => void refresh().catch((e) => setNotice(publicError(e)));
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [hidden, projectId]);
  const dirty = Object.values(drafts).some((d) => d.dirty);
  useEffect(() => {
    onPending(dirty || busy);
  }, [dirty, busy]);
  useEffect(() => {
    if (!ready) return;
    const stored = Object.fromEntries(Object.entries(drafts).filter(([, value]) => value.dirty));
    const input = Object.keys(stored).length
      ? { operation: 'write', content: { studioVersion: 9, drafts: stored } }
      : { operation: 'remove' };
    void window.cyroEV
      ?.draft?.({ projectId, channel: 'IDE', ...input })
      .catch((e) => setNotice(publicError(e)));
  }, [drafts, ready, projectId]);
  async function saveCode(key = keyFor(currentPane.current)) {
    const draft = draftRef.current[key];
    if (!draft) throw Error('Abra um arquivo antes de salvar.');
    const target = safeFilename(draft.name);
    if (target !== draft.name)
      throw Error('Use um nome de arquivo sem pastas ou caracteres especiais.');
    const original = draft.originalName === draft.name;
    if (!original && wb.current.files.some((f) => f.name === draft.name))
      throw Error('Já existe um arquivo com esse nome. Escolha outro nome para salvar uma cópia.');
    const next = await operation('workbench.write', {
      name: draft.name,
      content: draft.content,
      expectedFileRevision: original ? draft.entityRevision : -1,
    });
    dropDraft(key);
    if (next.panel?.kind === 'code' && next.panel.target === draft.name)
      await choose({ kind: 'code', target: draft.name, source: 'workbench' }, next);
    setNotice('Arquivo salvo no EV.');
    return draft.name;
  }
  async function execute(id) {
    reveal({ kind: 'preview', target: id, source: 'workbench' });
    const result = await window.cyroEV.execute({ projectId, requestId: id });
    if (!active.current) return;
    setLocalResults((old) => ({ ...old, [id]: result }));
    if (result.persistenceError) setNotice(result.persistenceError);
    if (!result.cancelled) await refresh();
    return result;
  }
  async function runFile(name) {
    const next = await operation('workbench.runFile', { name });
    if (next.panel?.target !== 'document') await execute(next.panel.target);
  }
  async function blockCode({ content, language }, run = false) {
    if (content.length > 64000)
      throw Error('Este trecho excede o limite de 64 mil caracteres do editor.');
    await refresh(false);
    let hash = 0;
    for (let i = 0; i < content.length; i++) hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
    const name = uniqueFilename(
      wb.current.files,
      filenameFor(language, 'codigo-' + hash.toString(16)),
      content,
    );
    let next = wb.current;
    if (!next.files.some((f) => f.name === name))
      next = await operation('workbench.write', { name, content, expectedFileRevision: -1 });
    await choose({ kind: 'code', target: name, source: 'workbench' }, next);
    if (run) await runFile(name);
  }
  async function uploaded(file, run = false) {
    const source = await window.cyroEV.readSource({ projectId, fileId: file.id });
    await refresh(false);
    const name = uniqueFilename(wb.current.files, source.name, source.content);
    let next = wb.current;
    if (!next.files.some((f) => f.name === name && f.content === source.content))
      next = await operation('workbench.write', {
        name,
        content: source.content,
        expectedFileRevision: -1,
      });
    await choose({ kind: 'code', target: name, source: 'workbench' }, next);
    setNotice('Cópia editável criada. O anexo original foi preservado.');
    if (run) await runFile(name);
  }
  async function uploadResources() {
    const result = await window.cyroEV.upload(projectId);
    if (result.canceled || !active.current) return;
    const failures = (result.failures || []).map((failure) => failure.name + ': ' + failure.error);
    for (const file of result.files || []) {
      try {
        if (category === 'code') await uploaded(file);
        if (category === 'table') {
          if (!/\.(xlsx|csv)$/i.test(file.name))
            throw Error('A importação de tabelas aceita CSV e XLSX.');
          await processDocument(file);
        }
      } catch (error) {
        failures.push(file.name + ': ' + publicError(error));
      }
    }
    setResourceRefresh((value) => value + 1);
    if (failures.length) setNotice(failures.join(' · '));
    else if (category === 'table') setNotice('Importação solicitada. Atualize as tabelas após o processamento.');
    else if (category === 'document') setNotice('Arquivos enviados ao EV.');
  }
  function processDocument(file) {
    return request({ action: 'file.process', projectId, operationId: uid(), id: file.id });
  }
  async function deleteStored(kind, item) {
    if (!window.confirm('Excluir ' + item.name + ' deste EV?')) return;
    if (kind === 'table' && draftRef.current[keyFor({ kind, source: 'space', target: item.id })]?.dirty)
      throw Error('Salve ou descarte suas edições antes de excluir a tabela.');
    await request({
      action: kind + '.delete', projectId, operationId: uid(), id: item.id,
      expectedRevision: item.revision, confirmation: 'EXCLUIR',
    });
    if (currentPane.current?.target === item.id) setPane(null);
    setResourceRefresh((value) => value + 1);
    await refresh(false);
  }
  function selectCategory(next) {
    setSearch('');
    if (next === 'preview') reveal({ kind: 'preview', target: 'console' });
    else {
      setCategory(next);
      setPane(null);
    }
  }
  async function saveTable() {
    const key = keyFor(pane),
      draft = draftRef.current[key];
    if (!draft) throw Error('Abra uma tabela.');
    let intent = null;
    if (draft.source === 'space') {
      const rows = draft.rows
        .map((r, i) => ({
          id: draft.rowIds[i],
          data: Object.fromEntries(
            r.flatMap((v, j) =>
              Object.is(v, draft.baseRows[i][j])
                ? []
                : [[draft.columnIds[j], typedCell(v, draft.types[j])]],
            ),
          ),
        }))
        .filter((r) => Object.keys(r.data).length);
      if (rows.length)
        await request({
          action: 'table.rows.update',
          projectId,
          operationId: uid(),
          id: pane.target,
          expectedRevision: draft.entityRevision,
          confirmed: true,
          rows,
        });
    } else {
      const saved = await operation('workbench.table', {
        name: draft.name,
        columns: draft.columns,
        rows: draft.rows,
        expectedTableRevision: draft.entityRevision,
      });
      intent = saved.panel;
    }
    dropDraft(key);
    await refresh(false);
    if (!intent || (intent.kind === 'table' && intent.target === pane.target))
      await choose(pane, wb.current, draft.offset || 0);
    setNotice('Tabela salva.');
  }
  async function removeResource(kind, name) {
    if (!window.confirm('Remover este recurso do Studio? Anexos originais continuam preservados.'))
      return;
    await operation('workbench.remove', { kind, name });
    if (pane?.target === name) setPane(null);
    if (kind === 'file') dropDraft(keyFor({ kind: 'code', source: 'workbench', target: name }));
    if (kind === 'table') dropDraft(keyFor({ kind: 'table', source: 'workbench', target: name }));
  }
  function newFile() {
    const name = uniqueFilename(
      [...wb.current.files, ...Object.values(draftRef.current)],
      'novo-arquivo.py',
      '',
      false,
    );
    const panel = { kind: 'code', target: name, source: 'workbench' };
    setDraft(keyFor(panel), {
      name,
      originalName: null,
      target: name,
      content: '',
      baseContent: '',
      entityRevision: -1,
      dirty: true,
    });
    reveal(panel);
  }
  useImperativeHandle(ref, () => ({
    openReference: (reference) => void perform(async () => {
      if (reference.kind === 'table') {
        const next = { kind: 'table', target: reference.id, source: 'space', rowId: reference.rowId, readOnly: true };
        if (draftRef.current[keyFor(next)]?.dirty)
          throw Error('Salve suas alterações antes de abrir a linha de referência.');
        await choose(next);
      } else {
        const { file } = await request({ action: 'file.get', projectId, id: reference.id });
        reveal({ kind: 'document', target: file.id, file });
      }
    }),
    openCode: (payload) => void perform(() => blockCode(payload, false)),
    runCode: (payload) => void perform(() => blockCode(payload, true)),
    openTable: (target, source = 'workbench') =>
      void perform(() => choose({ kind: 'table', target, source })),
    openFile: (name) =>
      void perform(() => choose({ kind: 'code', target: name, source: 'workbench' })),
    openExecution: (id) =>
      void perform(() => choose({ kind: 'preview', target: id, source: 'workbench' })),
    openIntent: (intent) =>
      void perform(async () => {
        await refresh(false);
        if (intent) await choose(intent);
        else onOpen();
      }),
  }));
  const paneKey = pane ? keyFor(pane) : '',
    draft = drafts[paneKey];
  const fileNames = [
    ...new Set([
      ...workbench.files.map((f) => f.name),
      ...Object.values(drafts)
        .filter((d) => d.originalName !== undefined)
        .map((d) => d.target || d.originalName || d.name),
    ]),
  ];
  const matches = (value) =>
    String(value).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
  const execution =
    pane?.kind === 'preview' ? workbench.executions.find((e) => e.id === pane.target) : null;
  const result = execution ? localResults[execution.id] || execution.result : null;
  let preview =
    pane?.target === 'document'
      ? workbench.preview
      : result && !result.cancelled
        ? { format: 'text', content: result.output, title: 'Resultado' }
        : null;
  if (preview?.format === 'text' && result?.exitCode === 0) {
    try {
      JSON.parse(preview.content);
      preview = { ...preview, format: 'json' };
    } catch {
      if (
        /^\s*<(?:!doctype|html|body|main|div|section|table|h[1-6])(?:\s|>)/i.test(preview.content)
      )
        preview = { ...preview, format: 'html' };
    }
  }
  const renderedPreview =
    preview && previewMode === 'text' ? { ...preview, format: 'text' } : preview;
  const title =
    pane?.kind === 'code'
      ? draft?.name || pane.target
      : pane?.kind === 'table'
        ? draft?.name || 'Tabela'
        : pane?.kind === 'document'
          ? pane.file.name
          : pane?.target === 'console'
            ? 'Terminal'
            : workbench.preview && pane?.target === 'document'
              ? workbench.preview.title
              : 'Preview';
  return (
    <aside
      className={'ev-studio' + (pane ? ' has-panel' : '')}
      hidden={hidden || !visible}
      aria-label="Arquivos e painéis do EV"
    >
      <div className="ev-studio-explorer">
        <header className="ev-studio-explorer-heading">
          <div>
            <span>STUDIO</span>
            <h2>Conteúdo do EV</h2>
          </div>
          <button
            type="button"
            title="Fechar Studio"
            aria-label="Fechar Studio"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <nav className={category ? 'ev-category-nav' : 'ev-category-home'} aria-label="Categorias do Studio">
          {category && <button type="button" aria-label="Início do Studio" onClick={() => selectCategory(null)}>
            <Icon name="chevron-right" />
          </button>}
          {categories.map(([id, label, icon]) => (
            <button key={id} type="button" aria-pressed={category === id} onClick={() => selectCategory(id)}>
              <Icon name={icon} />{label}
            </button>
          ))}
        </nav>
        {category && category !== 'preview' && <div className="ev-studio-explorer-tools">
          <label>
            <Icon name="search" />
            <input
              aria-label="Buscar recursos do EV"
              placeholder="Buscar no espaço"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {category === 'code' && <button
            title="Novo arquivo"
            aria-label="Novo arquivo"
            disabled={!ready || busy}
            onClick={newFile}
          >
            <Icon name="plus" />
          </button>}
          <button title="Enviar arquivos" aria-label="Enviar arquivos" disabled={!ready || busy}
            onClick={() => void perform(uploadResources)}>
            <Icon name="upload" />
          </button>
          <button
            title="Atualizar recursos"
            aria-label="Atualizar recursos"
            disabled={busy}
            onClick={() => {
              if (!ready) setRetry((n) => n + 1);
              else void perform(refresh);
            }}
          >
            <Icon name="refresh" />
          </button>
        </div>}
        {resourceMenu && (
          <AnchoredMenu menu={resourceMenu} onClose={() => setResourceMenu(null)}>
            {resourceMenu.items.map(({ label, run, disabled }) => (
              <button key={label} type="button" role="menuitem" disabled={disabled}
                onClick={() => {
                  setResourceMenu(null);
                  resourceMenu.trigger.focus({ preventScroll: true });
                  void perform(run);
                }}>
                {label}
              </button>
            ))}
          </AnchoredMenu>
        )}
        {!pane && notice && <p className="ev-studio-notice" role="status">{notice}</p>}
        {category && <div className="ev-studio-resource-scroll">
          {category === 'code' && <section className="ev-resource-group">
            <h3>
              <Icon name="code" />
              Códigos <small>{fileNames.length}</small>
            </h3>
            {fileNames.filter(matches).map((name) => (
              <div
                className={
                  'ev-resource-row ' +
                  (pane?.kind === 'code' && pane.target === name ? 'is-active' : '')
                }
                key={name}
              >
                <button
                  className="ev-resource-open"
                  {...resourceHandlers(name, [
                    { label: 'Editar', run: () => choose({ kind: 'code', target: name, source: 'workbench' }) },
                    { label: 'Executar', disabled: busy, run: async () => {
                      const key = keyFor({ kind: 'code', target: name, source: 'workbench' });
                      const target = draftRef.current[key]?.dirty ? await saveCode(key) : name;
                      await runFile(target);
                    } },
                    { label: 'Excluir', disabled: busy, run: () => removeResource('file', name) },
                  ])}
                  onClick={() =>
                    void perform(() => choose({ kind: 'code', target: name, source: 'workbench' }))
                  }
                >
                  <span className={'ev-file-glyph lang-' + languageFor(name)}>
                    {name.split('.').pop().slice(0, 3)}
                  </span>
                  <span>{name}</span>
                  {Object.values(drafts).some(
                    (d) =>
                      d.dirty && (d.originalName === name || d.name === name || d.target === name),
                  ) && <i className="ev-dirty-dot" />}
                </button>
              </div>
            ))}
            {!fileNames.length && (
              <p className="ev-resource-empty">Os códigos criados no chat aparecem aqui.</p>
            )}
          </section>}
          {category === 'table' && <section className="ev-resource-group">
            <h3>
              <Icon name="table" />
              Tabelas <small>{workbench.tables.length + tables.length}</small>
            </h3>
            {[
              ...workbench.tables.map((t) => ({ ...t, target: t.name, source: 'workbench' })),
              ...tables.map((t) => ({ ...t, target: t.id, source: 'space' })),
            ]
              .filter((t) => matches(t.name))
              .map((t) => (
                <div key={t.source + t.target} className="ev-studio-item">
                <button
                  className={
                    'ev-resource-table ' +
                    (pane?.kind === 'table' && pane.target === t.target ? 'is-active' : '')
                  }
                  aria-label={'Visualizar ' + t.name}
                  {...resourceHandlers(t.name, [
                    { label: 'Visualizar', run: () => choose({ kind: 'table', target: t.target, source: t.source, readOnly: true }) },
                    { label: 'Editar', run: () => choose({ kind: 'table', target: t.target, source: t.source }) },
                    { label: 'Excluir', disabled: busy, run: () => t.source === 'space'
                      ? deleteStored('table', t)
                      : removeResource('table', t.name) },
                  ])}
                  onClick={() =>
                    void perform(() =>
                      choose({ kind: 'table', target: t.target, source: t.source, readOnly: true }),
                    )
                  }
                >
                  <Icon name="table" />
                  <span>
                    {t.name}
                    <small>{t.rowCount ?? t.rows?.length ?? 0} linhas</small>
                  </span>
                  <Icon name="chevron-right" />
                </button>
                </div>
              ))}
            {!workbench.tables.length && !tables.length && (
              <p className="ev-resource-empty">Peça ao Cyro para criar uma tabela.</p>
            )}
            {tableNext != null && <button disabled={busy} onClick={() => void perform(async () => {
              const page = await request({ action: 'tables.list', projectId, limit: 100, offset: tableNext });
              if (!active.current) return;
              setTables((previous) => [...new Map([...previous, ...page.tables].map((table) => [table.id, table])).values()]);
              setTableNext(page.next ?? null);
            })}>Mais tabelas</button>}
          </section>}
          {category === 'document' && <section className="ev-resource-group ev-studio-uploads">
            <h3>
              <Icon name="folder" />
              Documentos
            </h3>
            <EVNotes
              projectId={projectId}
              hidden={hidden}
              mode="files"
              externalSearch={search}
              refreshKey={refreshKey + ':' + resourceRefresh}
              request={request}
              onOpen={(file) => reveal({ kind: 'document', target: file.id, file })}
              menuHandlers={(file) => resourceHandlers(file.name, [
                { label: 'Visualizar', run: () => reveal({ kind: 'document', target: file.id, file }) },
                { label: 'Analisar', disabled: busy || ['UPLOADING', 'PROCESSING'].includes(file.status), run: async () => {
                  await processDocument(file);
                  setResourceRefresh((value) => value + 1);
                  reveal({ kind: 'document', target: file.id, file });
                  setNotice('Análise solicitada.');
                } },
                { label: 'Baixar original', disabled: busy, run: () => window.cyroEV.download({ projectId, fileId: file.id }) },
                { label: 'Excluir', disabled: busy, run: () => deleteStored('file', file) },
              ])}
            />
          </section>}
          {category === 'preview' && !!workbench.executions.length && (
            <section className="ev-resource-group">
              <h3>
                <Icon name="terminal" />
                Execuções
              </h3>
              {[...workbench.executions].reverse().map((e) => (
                <button
                  className="ev-execution-resource"
                  key={e.id}
                  onClick={() => reveal({ kind: 'preview', target: e.id, source: 'workbench' })}
                >
                  <i
                    className={
                      e.result?.exitCode === 0 ? 'success' : e.result ? 'failed' : 'pending'
                    }
                  />
                  <span>
                    {e.runtime}
                    <small>{executionLabel(e)}</small>
                  </span>
                </button>
              ))}
            </section>
          )}
        </div>}
        <footer className="ev-studio-explorer-footer">
          {category === 'preview' && <button onClick={() => reveal({ kind: 'preview', target: 'console' })}>
            <Icon name="terminal" />
            Terminal
          </button>}
          <span title="Somente esta conta e este EV">
            <Icon name="shield" />
            Privado
          </span>
        </footer>
      </div>
      {pane && (
        <section
          className="ev-studio-panel"
          aria-label={
            pane.kind === 'code'
              ? 'Painel de código'
              : pane.kind === 'table'
                ? 'Painel da tabela'
                : pane.kind === 'document'
                  ? 'Preview do documento'
                  : 'Painel de preview'
          }
        >
          <header className="ev-studio-panel-heading">
            <div>
              <span>
                {pane.kind === 'code' ? 'CÓDIGO' : pane.kind === 'table' ? 'TABELA' : 'PREVIEW'}
              </span>
              <h2 title={title}>{title}</h2>
            </div>
            <button
              aria-label="Fechar painel"
              title="Fechar painel"
              onClick={() => {
                setPane(null);
              }}
            >
              <Icon name="close" />
            </button>
          </header>
          {notice && (
            <p className="ev-studio-notice" role="status">
              {notice}
            </p>
          )}
          {!ready ? (
            <div className="ev-studio-loading">Preparando seu espaço…</div>
          ) : pane.kind === 'code' && draft ? (
            <>
              <div className="ev-studio-toolbar">
                <input
                  className="ev-code-filename"
                  disabled={busy}
                  aria-label="Nome do arquivo de código"
                  title="Outro nome salva uma cópia e preserva o arquivo atual."
                  value={draft.name}
                  maxLength={100}
                  onChange={(e) =>
                    setDraft(paneKey, { ...draft, name: e.target.value, dirty: true })
                  }
                />
                <span className="ev-language-badge">{languageFor(draft.name)}</span>
                <span className="ev-studio-status">
                  <i className={draft.dirty ? 'dirty' : ''} />
                  {draft.dirty ? 'Rascunho' : 'Salvo'}
                </span>
                <button
                  title="Salvar código (Ctrl+S)"
                  aria-label="Salvar código"
                  disabled={
                    busy || (!draft.dirty && workbench.files.some((f) => f.name === draft.name))
                  }
                  onClick={() => void perform(() => saveCode())}
                >
                  <Icon name="code-save" />
                </button>
                <button
                  title="Baixar código"
                  aria-label="Baixar código"
                  disabled={
                    busy || draft.dirty || !workbench.files.some((f) => f.name === draft.name)
                  }
                  onClick={() =>
                    void perform(() => window.cyroEV.exportSource({ projectId, name: draft.name }))
                  }
                >
                  <Icon name="download" />
                </button>
                <button
                  title="Remover arquivo"
                  aria-label="Remover arquivo"
                  disabled={
                    busy || draft.dirty || !workbench.files.some((f) => f.name === draft.name)
                  }
                  onClick={() => void perform(() => removeResource('file', draft.name))}
                >
                  <Icon name="trash" />
                </button>
                <button
                  className="ev-run-primary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const name = draft.dirty ? await saveCode() : draft.name;
                      await runFile(name);
                    })
                  }
                >
                  <Icon name="play" />
                  Executar
                </button>
              </div>
              <EVCodeEditor
                readOnly={busy}
                name={draft.name}
                value={draft.content}
                onChange={(content) =>
                  setDraft(paneKey, {
                    ...draft,
                    content,
                    dirty: content !== draft.baseContent || draft.name !== draft.originalName,
                  })
                }
                onSave={() => void perform(() => saveCode())}
              />
              <footer className="ev-code-footer">
                <span>{draft.content.split('\n').length} linhas · UTF-8</span>
                <span>Tab indenta · Ctrl+S salva · Esc, Tab sai</span>
                {draft.dirty && (
                  <button
                    onClick={() => {
                      if (window.confirm('Descartar as alterações locais deste arquivo?')) {
                        dropDraft(paneKey);
                        void choose(pane);
                      }
                    }}
                  >
                    Descartar
                  </button>
                )}
              </footer>
            </>
          ) : pane.kind === 'table' && draft ? (
            <EVTableEditor
              draft={draft}
              readOnly={pane.readOnly}
              busy={busy}
              onChange={(value) => setDraft(paneKey, value)}
              onDelete={
                draft.source !== 'space'
                  ? () => void perform(() => removeResource('table', draft.name))
                  : undefined
              }
              onSave={() => void perform(saveTable)}
              onReload={() =>
                void perform(async () => {
                  if (
                    !draft.dirty ||
                    window.confirm('Descartar edições e carregar a tabela salva?')
                  ) {
                    dropDraft(paneKey);
                    await choose(pane);
                  }
                })
              }
              focusRowId={pane.rowId}
              onPage={(offset) => void perform(() => choose({ ...pane, rowId: undefined }, wb.current, offset))}
              onExport={() =>
                void perform(async () => {
                  const content = csvFor(draft),
                    name = uniqueFilename(
                      wb.current.files,
                      safeFilename(draft.name).slice(0, 70) +
                        (draft.source === 'space'
                          ? '-pagina-' + ((draft.offset || 0) / 50 + 1)
                          : '') +
                        '.csv',
                      content,
                    );
                  const next = await operation('workbench.write', {
                    name,
                    content,
                    expectedFileRevision: wb.current.files.some((f) => f.name === name)
                      ? wb.current.files.find((f) => f.name === name).revision || 0
                      : -1,
                  });
                  await choose({ kind: 'code', target: name, source: 'workbench' }, next);
                })
              }
            />
          ) : pane.kind === 'document' ? (
            <>
              <div className="ev-studio-toolbar">
                <button onClick={() => onUse(pane.file)}>Usar na conversa</button>
                <button onClick={() => void perform(() => uploaded(pane.file, false))}>
                  <Icon name="code" />
                  Abrir código
                </button>
                <button onClick={() => void perform(() => uploaded(pane.file, true))}>
                  <Icon name="play" />
                  Executar
                </button>
                <button
                  title="Baixar original"
                  onClick={() =>
                    void perform(() => window.cyroEV.download({ projectId, fileId: pane.file.id }))
                  }
                >
                  <Icon name="download" />
                </button>
              </div>
              <div className="ev-studio-document">
                <EVNotes
                  key={pane.target}
                  mode="detail"
                  selectedFile={pane.target}
                  projectId={projectId}
                  hidden={hidden}
                  refreshKey={refreshKey + ':' + resourceRefresh}
                  request={request}
                  onUse={onUse}
                  renderFiscal={renderFiscal}
                  renderAnalysis={renderAnalysis}
                />
              </div>
            </>
          ) : pane.kind === 'preview' ? (
            <>
              <div className="ev-studio-preview-tabs">
                <button
                  aria-pressed={previewMode === 'auto'}
                  onClick={() => setPreviewMode('auto')}
                >
                  Resultado
                </button>
                <button
                  aria-pressed={previewMode === 'text'}
                  onClick={() => setPreviewMode('text')}
                >
                  Saída de texto
                </button>
              </div>
              <div className="ev-studio-preview-meta">
                <span
                  className={
                    'ev-execution-pill ' +
                    (result?.exitCode === 0 ? 'success' : result ? 'failed' : '')
                  }
                >
                  <Icon name="terminal" />
                  {execution
                    ? executionLabel({
                        ...execution,
                        result: result?.cancelled ? undefined : result,
                      })
                    : preview?.format === 'html'
                      ? 'HTML estático'
                      : preview?.format || 'Terminal'}
                </span>
                {execution && (
                  <small>
                    {execution.runtime} ·{' '}
                    {new Date(execution.createdAt).toLocaleTimeString('pt-BR')}
                  </small>
                )}
                {execution && !busy && (
                  <button
                    onClick={() =>
                      void perform(async () => {
                        if (result && !result.cancelled) {
                          const next = await operation('workbench.execute', {
                            runtime: execution.runtime,
                            source: execution.source,
                          });
                          await execute(next.panel.target);
                        } else await execute(execution.id);
                      })
                    }
                  >
                    <Icon name="play" />
                    {result ? 'Nova execução' : 'Revisar e executar'}
                  </button>
                )}
              </div>
              {busy && (
                <p className="ev-preview-running" role="status">
                  <i />
                  Preparando ou executando…
                </p>
              )}
              {result?.cancelled ? (
                <div className="ev-studio-empty">
                  <strong>Execução cancelada</strong>
                  <p>Nenhum código foi executado. Você pode revisar e tentar novamente.</p>
                </div>
              ) : (
                <EVPreview preview={renderedPreview} />
              )}
              {result?.files?.length > 0 && (
                <p role="status">Arquivos salvos no EV: {result.files.join(', ')}.</p>
              )}
              {result?.conflicts?.length > 0 && (
                <p role="alert">
                  Edições recentes preservadas. Não importados: {result.conflicts.join(', ')}.
                </p>
              )}
              {result?.warnings?.map((warning, i) => (
                <p key={i} role="status">
                  {warning}
                </p>
              ))}
              {execution && (
                <details className="ev-execution-code">
                  <summary>Código e arquivos desta execução</summary>
                  <pre>{execution.source}</pre>
                  {execution.files.map((f) => (
                    <details key={f.name}>
                      <summary>{f.name}</summary>
                      <pre>{f.content}</pre>
                    </details>
                  ))}
                </details>
              )}
              {pane.target === 'console' && (
                <div className="ev-terminal-composer">
                  <label>
                    Linguagem
                    <select
                      aria-label="Linguagem do terminal"
                      value={runtime}
                      onChange={(e) => setRuntime(e.target.value)}
                    >
                      <option value="shell">Comandos Linux</option>
                      <option value="python">Python</option>
                      <option value="javascript">JavaScript</option>
                    </select>
                  </label>
                  <textarea
                    aria-label="Código ou comando do terminal"
                    spellCheck={false}
                    placeholder="Digite seu comando…"
                    value={command}
                    maxLength={32000}
                    onChange={(e) => setCommand(e.target.value)}
                  />
                  <button
                    disabled={busy || !command.trim()}
                    onClick={() =>
                      void perform(async () => {
                        const next = await operation('workbench.execute', {
                          runtime,
                          source: command,
                        });
                        await execute(next.panel.target);
                      })
                    }
                  >
                    <Icon name="play" />
                    Executar com autorização
                  </button>
                  <small>
                    Área privada do EV no servidor · sem rede · até 15 segundos e 128 MB.
                  </small>
                </div>
              )}
            </>
          ) : (
            <div className="ev-studio-loading">Abrindo recurso…</div>
          )}
        </section>
      )}
      {!pane && notice && (
        <p className="ev-studio-floating-notice" role="status">
          {notice}
        </p>
      )}
    </aside>
  );
});

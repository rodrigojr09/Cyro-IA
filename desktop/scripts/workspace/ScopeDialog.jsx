import React, { useEffect, useState } from 'react';
import { api, post } from '../shared/bridge';
import { Dialog } from '../ui/components';
export const beneath = (path, parent) =>
  parent === '.' ||
  path.toLowerCase() === parent.toLowerCase() ||
  path.toLowerCase().startsWith(parent.toLowerCase() + '/');
export function isSelected(path, include, exclude) {
  return (
    [
      ...include.map((rule) => ({ rule, yes: true })),
      ...exclude.map((rule) => ({ rule, yes: false })),
    ]
      .filter((item) => beneath(path, item.rule))
      .sort((a, b) => b.rule.length - a.rule.length)[0]?.yes || false
  );
}
export function ScopeDialog({ project, onClose, onSaved }) {
  const [state, setState] = useState({
    include: [],
    exclude: [],
    path: '.',
    entries: [],
    next: null,
    busy: false,
    error: '',
    ready: false,
  });
  const patch = (change) => setState((value) => ({ ...value, ...change }));
  async function load(path = '.', append = false) {
    patch({ busy: true, error: '' });
    try {
      const data = await api(
        '/projects/selection?project_id=' +
          encodeURIComponent(project.id) +
          '&path=' +
          encodeURIComponent(path) +
          '&offset=' +
          (append ? state.next || 0 : 0),
      );
      setState((value) => ({
        ...value,
        path,
        entries: append ? [...value.entries, ...data.entries] : data.entries,
        next: data.next_offset,
        busy: false,
        error: data.truncated ? 'Listagem parcial. Abra subpastas ou carregue mais nomes.' : '',
      }));
    } catch (error) {
      patch({ busy: false, error: error.message });
    }
  }
  useEffect(() => {
    let active = true;
    if (project) {
      patch({ busy: true, ready: false });
      void api('/projects/selection?project_id=' + encodeURIComponent(project.id))
        .then((data) => {
          if (active)
            patch({
              include: data.selection.confirmed ? data.selection.include : ['.'],
              exclude: data.selection.confirmed ? data.selection.exclude : [],
              path: '.',
              entries: data.entries,
              next: data.next_offset,
              busy: false,
              ready: true,
            });
        })
        .catch((error) => active && patch({ busy: false, error: error.message }));
    }
    return () => {
      active = false;
    };
  }, [project?.id]);
  function choose(path, checked) {
    setState((value) => ({
      ...value,
      include: [
        ...value.include.filter((rule) => !beneath(rule, path)),
        ...(checked ? [path] : []),
      ],
      exclude: [
        ...value.exclude.filter((rule) => !beneath(rule, path)),
        ...(!checked ? [path] : []),
      ],
    }));
  }
  return (
    <Dialog
      id="scope-dialog"
      title="Quais arquivos fazem parte do projeto?"
      open={!!project}
      onClose={() => !state.busy && onClose()}
    >
      <p>
        A seleção usa apenas nomes, tipos e tamanhos: <strong>zero tokens</strong>. Só os arquivos
        selecionados poderão ser analisados. Limite de <strong>5 MB</strong>; segredos, dependências
        e builds continuam bloqueados.
      </p>
      <div id="scope-location">
        {project?.name} / {state.path}
      </div>
      <div className="scope-actions">
        <button
          id="scope-up"
          disabled={state.busy || state.path === '.'}
          onClick={() =>
            load(state.path.includes('/') ? state.path.slice(0, state.path.lastIndexOf('/')) : '.')
          }
        >
          Voltar
        </button>
        <button id="scope-all" disabled={state.busy} onClick={() => choose(state.path, true)}>
          Incluir pasta atual
        </button>
        <button id="scope-none" disabled={state.busy} onClick={() => choose(state.path, false)}>
          Desmarcar pasta atual
        </button>
      </div>
      <div id="scope-list">
        {state.entries.map((item) => (
          <div className="scope-row" key={item.path}>
            <label>
              <input
                type="checkbox"
                disabled={state.busy || item.disabled}
                checked={!item.disabled && isSelected(item.path, state.include, state.exclude)}
                ref={(node) => {
                  if (node)
                    node.indeterminate =
                      !item.disabled &&
                      [...state.include, ...state.exclude].some(
                        (rule) =>
                          rule !== item.path &&
                          beneath(rule, item.path) &&
                          isSelected(rule, state.include, state.exclude) !==
                            isSelected(item.path, state.include, state.exclude),
                      );
                }}
                onChange={(event) => choose(item.path, event.target.checked)}
              />
              <span>
                {item.name}
                {item.type === 'directory' ? '/' : ''}
              </span>
            </label>
            {item.disabled ? (
              <small>{item.reason}</small>
            ) : (
              item.type === 'directory' && <button onClick={() => load(item.path)}>Abrir</button>
            )}
          </div>
        ))}
      </div>
      <button
        id="scope-more"
        hidden={state.next === null}
        disabled={state.busy}
        onClick={() => load(state.path, true)}
      >
        Carregar mais nomes
      </button>
      <p id="scope-summary">
        {state.include.length} inclusões, {state.exclude.length} exclusões. Máximo: 5 MB. Zero
        tokens.
      </p>
      <p id="scope-error" role="status">
        {state.error}
      </p>
      <div className="scope-actions">
        <button id="scope-cancel" disabled={state.busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          id="scope-save"
          disabled={state.busy || !state.ready}
          onClick={async () => {
            patch({ busy: true, error: '' });
            try {
              const selection = {
                project_id: project.id,
                include: state.include,
                exclude: state.exclude,
              };
              const size = await post('/projects/selection/size', selection);
              if (
                !Number.isFinite(size.selected_bytes) ||
                !Number.isFinite(size.max_bytes) ||
                !size.within_limit ||
                size.selected_bytes > size.max_bytes
              )
                throw Error('A seleção ultrapassa 5 MB. Remova arquivos antes de enviar.');
              await post('/projects/selection/save', selection);
              await onSaved();
              onClose();
            } catch (error) {
              patch({ error: error.message });
            } finally {
              patch({ busy: false });
            }
          }}
        >
          Salvar seleção e analisar
        </button>
      </div>
    </Dialog>
  );
}

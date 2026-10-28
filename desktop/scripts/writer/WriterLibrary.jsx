import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/components';
export function WriterLibrary({ project, writer, onClose, onSelect, onCreate, onOpenFile, onRun }) {
  const [catalog, setCatalog] = useState(null),
    [removed, setRemoved] = useState(false),
    [parent, setParent] = useState('');
  async function refresh() {
    if (project) setCatalog(await writer.command('open', {}, project.id));
  }
  useEffect(() => {
    let active = true;
    setCatalog(null);
    if (project)
      void writer
        .command('open', {}, project.id)
        .then((value) => {
          if (active) setCatalog(value);
        })
        .catch((error) => writer.set({ error: error.message }));
    return () => {
      active = false;
    };
  }, [project?.id]);
  return (
    <Dialog
      id="writer-file-choice"
      title="Arquivos do Cyro IA Writer"
      open={!!project}
      onClose={onClose}
    >
      <p>
        Documentos e pastas ficam no projeto deste computador. Escolha um documento existente, crie
        um novo ou autorize um arquivo pelo Windows.
      </p>
      <div className="writer-files-heading">
        <button id="writer-new" onClick={onCreate}>
          Novo documento
        </button>
        <button id="writer-choose-file" onClick={onOpenFile}>
          Abrir arquivo
        </button>
        <button
          id="writer-new-folder"
          onClick={() =>
            onRun(async () => {
              const title = await onRun.ask('Nome da pasta', '');
              if (!title) return;
              await writer.command(
                'create',
                { title, kind: 'folder', parentId: parent || null },
                project.id,
              );
              await refresh();
            })
          }
        >
          Nova pasta
        </button>
        <button
          id="writer-trash"
          aria-pressed={removed}
          onClick={() => setRemoved((value) => !value)}
        >
          {removed ? 'Ver ativos' : 'Itens removidos'}
        </button>
      </div>
      <label>
        Pasta
        <select
          id="writer-parent"
          value={parent}
          onChange={(event) => setParent(event.target.value)}
        >
          <option value="">Raiz do projeto</option>
          {catalog?.nodes
            ?.filter((node) => node.kind === 'folder' && !node.deleted)
            .map((node) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
        </select>
      </label>
      <nav id="writer-tree" aria-label="Documentos Writer">
        {catalog?.nodes
          ?.filter((node) => !!node.deleted === removed && (node.parent || '') === parent)
          .map((node) => (
            <div className="writer-tree-row" key={node.id}>
              {node.kind === 'folder' ? (
                <button onClick={() => setParent(node.id)}>{node.title}/</button>
              ) : (
                <button
                  disabled={!!node.deleted}
                  onClick={() =>
                    onRun(async () => {
                      await onSelect(
                        await writer.command('bind_chat', { id: node.id }, project.id),
                      );
                      onClose();
                    })
                  }
                >
                  {node.title}
                </button>
              )}
              {node.deleted && (
                <button
                  onClick={() =>
                    onRun(async () => {
                      const document = await writer.command(
                        'get',
                        { id: node.id, include_removed: true },
                        project.id,
                      );
                      await writer.command(
                        'undo',
                        { id: node.id, base_version: document.version },
                        project.id,
                      );
                      await refresh();
                    })
                  }
                >
                  Desfazer remoção
                </button>
              )}
            </div>
          ))}
        {catalog &&
          !catalog.nodes.some(
            (node) => !!node.deleted === removed && (node.parent || '') === parent,
          ) && <p>Nenhum item nesta pasta.</p>}
      </nav>
    </Dialog>
  );
}

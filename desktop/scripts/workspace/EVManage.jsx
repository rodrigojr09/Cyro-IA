import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui/components';
import { publicError } from '../shared/bridge';
import { evRequest } from './EVWorkspace';

export function EVManage({ item, onClose, onChanged }) {
  const [space, setSpace] = useState(null),
    [name, setName] = useState(''),
    [mode, setMode] = useState(''),
    [lastId, setLastId] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setSpace(null);
    setMode('');
    setError('');
    if (item)
      evRequest({ action: 'open', projectId: item.id })
        .then((out) => {
          if (active) {
            setSpace(out.space);
            setName(out.space.name);
          }
        })
        .catch((e) => {
          if (active) setError(publicError(e));
        });
    return () => {
      active = false;
    };
  }, [item?.id]);
  async function perform(fn) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(publicError(e));
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    await perform(async () => {
      if (!space.chatId) throw Error('Reabra o EV para carregar seu chat.');
      const out = await evRequest({
        action: 'conversation.read',
        projectId: space.id,
        id: space.chatId,
      });
      setLastId(out.messages.at(-1)?.id || 0);
      setMode('clear');
    });
  }
  async function confirm() {
    await perform(async () => {
      const action = mode === 'clear' ? 'conversation.clear' : 'delete';
      await evRequest({
        action,
        projectId: space.id,
        operationId: crypto.randomUUID(),
        ...(mode === 'clear'
          ? { id: space.chatId, expectedLastMessageId: lastId, confirmation: 'LIMPAR' }
          : { expectedRevision: space.revision, confirmation: 'EXCLUIR' }),
      });
      onChanged({ action: mode, space });
      onClose();
    });
  }
  return (
    <Dialog
      id="ev-manage"
      title={
        mode === 'clear'
          ? 'Limpar mensagens do EV'
          : mode === 'delete'
            ? 'Excluir EV'
            : 'Opções do EV'
      }
      open={!!item}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && <p role="alert">{error}</p>}
      {!space && !error && <p>Carregando opções…</p>}
      {space && (
        <div className="ev-manage-body">
          <p>
            <strong>{space.name}</strong>
            <br />
            <small>
              {space.extensionId} · v{space.extensionVersion || '1.0.0'}
            </small>
          </p>
          {!mode ? (
            <>
              <p>Chat, memória e arquivos privados deste EV.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(async () => {
                    const out = await evRequest({
                      action: 'rename',
                      projectId: space.id,
                      operationId: crypto.randomUUID(),
                      expectedRevision: space.revision,
                      name: name.trim(),
                      description: space.description || '',
                    });
                    onChanged({ action: 'rename', space: out.space });
                    onClose();
                  });
                }}
              >
                <label>
                  Nome do EV
                  <input
                    aria-label="Nome do EV"
                    value={name}
                    maxLength={120}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy || !name.trim() || name.trim() === space.name}>
                  Salvar nome
                </button>
              </form>
              <div className="ev-manage-actions">
                <button disabled={busy || !space.chatId} onClick={() => void clear()}>
                  Limpar mensagens
                </button>
                <button className="danger" disabled={busy} onClick={() => setMode('delete')}>
                  Excluir EV
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {mode === 'clear'
                  ? 'Isso remove o histórico desta conversa. A memória, os arquivos, códigos e tabelas do EV continuam disponíveis.'
                  : 'O EV será removido da sua lista. Os dados ficam sob retenção de 30 dias no servidor.'}
              </p>
              <div className="ev-manage-actions">
                <button disabled={busy} onClick={() => setMode('')}>
                  Voltar
                </button>
                <button className="danger" disabled={busy} onClick={() => void confirm()}>
                  {busy
                    ? 'Processando…'
                    : mode === 'clear'
                      ? 'Confirmar limpeza'
                      : 'Confirmar exclusão'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

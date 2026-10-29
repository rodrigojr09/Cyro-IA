import React, { useEffect, useState } from 'react';
export function UpdateNotice() {
  const bridge = window.cyroUpdates;
  const [state, setState] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    const unsub = bridge.onState(setState);
    void bridge
      .state()
      .then(setState)
      .catch(() => {});
    return unsub;
  }, [bridge]);
  if (!bridge || !state?.release) return null;
  const phases = {
    preparing: 'Preparando',
    downloading: 'Baixando',
    verifying: 'Verificando',
    ready: 'Pronto para instalar',
    installing: 'Instalando',
    error: 'Erro',
  };
  async function run(action) {
    setBusy(true);
    try {
      setState(await bridge[action]());
    } catch {
      setState((v) => ({ ...v, error: 'Atualização indisponível. Tente novamente.' }));
    } finally {
      setBusy(false);
    }
  }
  const running =
    busy || ['preparing', 'downloading', 'verifying', 'installing'].includes(state.phase);
  return (
    <aside className="update-notice" aria-label="Atualização do Cyro">
      <strong>Nova atualização do Cyro disponível!</strong>
      <p>Versão {state.release.version}</p>
      <p>
        Uma nova versão do Cyro está disponível. Atualize para receber as melhorias e correções mais
        recentes.
      </p>
      {phases[state.phase] && (
        <p role="status">
          {phases[state.phase]}
          {state.phase === 'downloading' ? ' · ' + state.progress + '%' : ''}
        </p>
      )}
      {state.phase === 'downloading' && <progress max={100} value={state.progress} />}
      <div>
        <button
          disabled={running}
          onClick={() => void run(state.phase === 'ready' ? 'install' : 'download')}
        >
          {state.phase === 'ready' ? 'Instalar e encerrar' : 'Atualizar Automaticamente'}
        </button>
        <button disabled={running} onClick={() => void run('manual')}>
          Link para Baixar
        </button>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
    </aside>
  );
}

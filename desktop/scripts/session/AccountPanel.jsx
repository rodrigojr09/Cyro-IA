import React, { useEffect, useState } from 'react';
export function AccountPanel() {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      setData(await window.jarvisAuth.account());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    window.jarvisAuth
      .account()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <h3>Conta e plano</h3>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Consultando sua conta…</p>}
      {data && (
        <>
          {!data.commercialEnabled && <p>Limites comerciais em homologação; sua conta mantém o acesso vigente.</p>}
          <p>
            {data.user.name} · {data.user.email}
          </p>
          <p>
            Plano: {data.plan.name} ({data.plan.subscription.state})
          </p>
          <p>
            Tokens hoje: {data.usage?.tokens || '0'} de {data.plan.dailyTokens}. Reservados:{' '}
            {data.usage?.reservedTokens || '0'}.
          </p>
          <p>
            Solicitações hoje: {data.usage?.messages || 0} de{' '}
            {data.plan.dailyMessages ?? 'sem limite fixo'}.
          </p>
          <p>Renovação diária: {new Date(data.nextResetAt).toLocaleString()} (00:00 UTC).</p>
          <p>
            {data.plan.features.ev
              ? 'Espaços Virtuais disponíveis.'
              : 'Espaços Virtuais exigem o plano pago. Dados anteriores permanecem preservados.'}
          </p>
          <p>O plano pago é ativado manualmente pelo administrador.</p>
        </>
      )}
      <button disabled={busy} onClick={load}>
        Atualizar consumo
      </button>
      <button
        onClick={() => window.jarvisAuth.openAccount('account').catch((e) => setError(e.message))}
      >
        Gerenciar conta no navegador
      </button>
    </section>
  );
}

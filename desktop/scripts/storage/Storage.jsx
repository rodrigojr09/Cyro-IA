import React from 'react';
export function Storage({ snapshot, busy, onClear }) {
  const format = (bytes) =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(bytes / 1048576) + ' MB';
  return (
    <section>
      <h3>Armazenamento</h3>
      <p>Chats gerais ficam na nuvem. Projetos, seus chats e anexos ficam neste computador.</p>
      <div id="storage-usage">
        {['local', 'cloud'].map((scope) => {
          const usage = snapshot?.[scope];
          return (
            <section key={scope}>
              <h4>{scope === 'local' ? 'Neste computador' : 'Na nuvem'}</h4>
              <p>
                {usage
                  ? format(usage.usedBytes) +
                    (usage.limitBytes ? ' de ' + format(usage.limitBytes) : '')
                  : snapshot?.cloudError || 'Indisponível nesta edição.'}
              </p>
              {usage?.limitBytes && (
                <progress
                  max={usage.limitBytes}
                  value={usage.usedBytes}
                  aria-label="Armazenamento na nuvem utilizado"
                />
              )}
              {usage && (
                <button className="danger" disabled={busy} onClick={() => onClear(scope)}>
                  {scope === 'cloud' ? 'Apagar chats na nuvem' : 'Limpar dados locais'}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p>
        Apagar dados é permanente e exige confirmação na janela do Windows. Sua conta e os arquivos
        originais serão preservados.
      </p>
    </section>
  );
}

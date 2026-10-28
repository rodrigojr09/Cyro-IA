import React, { useState } from 'react';
import { api, post } from '../shared/bridge';
import { ActionConfirmation } from '../chat/Conversation';
export function Computer() {
  const [action, setAction] = useState('system'),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(''),
    [pending, setPending] = useState(null);
  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      setText(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Controle do computador</h3>
      <p>Consultas são locais. Abrir aplicativos ou pastas exige sua confirmação.</p>
      <label>
        Ação
        <select
          id="computer-action"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        >
          {[
            ['system', 'Informações do sistema'],
            ['processes', 'Listar processos'],
            ['app:notepad', 'Abrir Bloco de Notas'],
            ['app:calculator', 'Abrir Calculadora'],
            ['app:vscode', 'Abrir VS Code'],
            ['folder:desktop', 'Abrir Área de Trabalho'],
            ['folder:documents', 'Abrir Documentos'],
            ['folder:downloads', 'Abrir Downloads'],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        id="computer-run"
        disabled={busy}
        onClick={() =>
          run(async () => {
            setPending(null);
            if (action === 'system') {
              const value = await api('/computer/system');
              const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1) + ' GB';
              setText(
                `${value.os} ${value.release} (${value.architecture})\nCPUs lógicas: ${value.cpu_logical_count}\nMemória: ${gb(value.memory_available_bytes)} de ${gb(value.memory_total_bytes)}\nDisco livre: ${gb(value.system_disk_free_bytes)}`,
              );
            } else if (action === 'processes') {
              const value = await api('/computer/processes');
              setText(value.processes.map((item) => item.pid + ' — ' + item.name).join('\n'));
            } else {
              const [kind, target] = action.split(':');
              const value = await post(kind === 'app' ? '/action/open' : '/action/folder', {
                [kind === 'app' ? 'app' : 'folder']: target,
              });
              setPending(value.pending_action);
              setText('Revise a solicitação antes de confirmar.');
            }
          })
        }
      >
        Consultar / abrir
      </button>
      <pre role="status">{text}</pre>
      {pending && <ActionConfirmation action={pending} onRun={run} />}
    </section>
  );
}

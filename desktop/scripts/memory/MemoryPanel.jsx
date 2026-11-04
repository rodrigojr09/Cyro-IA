import React, { useEffect, useRef, useState } from 'react';
import { evRequest } from '../workspace/EVWorkspace';
import { publicError } from '../shared/bridge';

function ScopeMemory({ scope, projectId }) {
  const [view, setView] = useState(null), [input, setInput] = useState(''), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [proposal, setProposal] = useState(null);
  const pending = useRef(null), alive = useRef(true);
  const target = { scope, ...(scope === 'EV' ? { projectId } : {}) };
  const load = async () => {
    const out = await evRequest({ action: 'memory.list', ...target, limit: 30, offset: 0, search: '' });
    if (alive.current) setView(out);
  };
  useEffect(() => { alive.current = true; load().catch(e => { if (alive.current) setError(publicError(e)); }); return () => { alive.current = false; }; }, []);
  async function send(message = input) {
    if (busy || !message.trim()) return;
    setBusy(true); setError('');
    if (pending.current?.message !== message) pending.current = { message, operationId: crypto.randomUUID() };
    try {
      const out = await evRequest({ action: 'memory.message', ...target, ...pending.current });
      if (!alive.current) return;
      pending.current = null;
      setMessages(old => [...old.slice(-18), { role: 'user', content: message }, { role: 'assistant', content: out.reply }]);
      setProposal(out.proposal || null); setInput('');
      if (out.persisted) await load();
    } catch (e) { if (alive.current) setError(publicError(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function confirm(decision) {
    if (!proposal || busy) return;
    setBusy(true); setError('');
    try {
      const out = await evRequest({ action: 'memory.confirm', ...target, proposalId: proposal.id, decision });
      if (!alive.current) return;
      setMessages(old => [...old.slice(-19), { role: 'assistant', content: out.reply }]); setProposal(null);
      if (out.persisted) await load();
    } catch (e) { if (alive.current) setError(publicError(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="memory-panel" aria-label={scope === 'MAIN' ? 'Memória principal' : 'Memória do EV'}>
    <p>{scope === 'MAIN' ? 'Sua memória principal acompanha os chats e o Quick Chat.' : 'Esta memória pertence somente ao espaço ativo.'}</p>
    {view && <><p className="memory-summary">{view.store.summary || 'Ainda não há informações registradas.'}</p><small>{view.store.syncState === 'READY' ? 'Resumo sincronizado' : 'Informações salvas; resumo aguardando sincronização'}</small><details><summary>Informações e origens</summary><ul>{view.items.map(item => <li key={item.id}>{item.content}<small> · {item.origin?.kind === 'AUTO_USER' ? 'Memorizada automaticamente' : 'Informação registrada'} · {new Date(item.updatedAt).toLocaleString('pt-BR')}</small></li>)}</ul></details></>}
    <div className="memory-chat" role="log" aria-label="Conversa sobre memória">{messages.map((message, i) => <p key={i} className={'memory-message ' + message.role}><strong>{message.role === 'user' ? 'Você' : 'Cyro'}: </strong>{message.content}</p>)}</div>
    {proposal && <section className="memory-confirm" aria-label="Confirmar alteração de memória"><p>{proposal.content}</p>{proposal.preview?.map((text, i) => <p key={i}>{text}</p>)}<button disabled={busy} onClick={() => confirm('APPLY')}>Confirmar alteração</button><button disabled={busy} onClick={() => confirm('CANCEL')}>Cancelar</button></section>}
    <form onSubmit={e => { e.preventDefault(); void send(); }}><label>Gerenciar memória<textarea aria-label="Mensagem sobre memória" placeholder="O que você deseja que o Cyro lembre ou esqueça?" value={input} maxLength={2000} disabled={busy} onChange={e => setInput(e.target.value)} /></label><button disabled={busy || !input.trim()}>Enviar</button></form>
    <button disabled={busy} onClick={() => send(scope === 'MAIN' ? 'Limpe toda minha memória principal.' : 'Limpe toda a memória deste EV.')}>{scope === 'MAIN' ? 'Limpar memória principal' : 'Limpar memória deste EV'}</button>
    {busy && <p role="status">Atualizando…</p>}{error && <p role="alert">{error}</p>}
    <p className="read-only-note">Limpar retira os fatos da memória ativa, sem apagar conversas, arquivos ou tabelas. Cópias técnicas e backups seguem a política de retenção.</p>
  </section>;
}
export function MemoryPanel({ projectId }) {
  const [scope, setScope] = useState('MAIN'), [settings, setSettings] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(null);
  useEffect(() => { let active = true; evRequest({ action: 'memory.settings.get' }).then(out => { if (active) setSettings(out.settings); }).catch(e => { if (active) setError(publicError(e)); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!projectId) setScope('MAIN'); }, [projectId]);
  async function change(key, value) {
    if (!settings || busy) return; setBusy(true); setError('');
    const next = { ...settings, [key]: value };
    const command = { action: 'memory.settings', ...next, expected: settings };
    const digest = JSON.stringify(command);
    if (pending.current?.digest !== digest) pending.current = { digest, id: crypto.randomUUID() };
    try { const out = await evRequest({ ...command, operationId: pending.current.id }); setSettings(out.settings); pending.current = null; }
    catch (e) { setError(publicError(e)); } finally { setBusy(false); }
  }
  return <><h3>Memória</h3><label className="memory-toggle"><input type="checkbox" checked={settings?.automatic || false} disabled={!settings || busy} onChange={e => change('automatic', e.target.checked)} />Memorizar novas informações automaticamente</label><label className="memory-toggle"><input type="checkbox" checked={settings?.useExisting || false} disabled={!settings || busy} onChange={e => change('useExisting', e.target.checked)} />Usar memórias existentes nas respostas</label><p>Desativar a memorização automática preserva os fatos atuais e permite pedidos explícitos para lembrar ou esquecer.</p>{error && <p role="alert">{error}</p>}<nav aria-label="Escopo de memória"><button aria-pressed={scope === 'MAIN'} onClick={() => setScope('MAIN')}>Principal</button>{projectId && <button aria-pressed={scope === 'EV'} onClick={() => setScope('EV')}>Espaço ativo</button>}</nav><ScopeMemory key={scope + ':' + (projectId || '')} scope={scope} projectId={projectId} /></>;
}

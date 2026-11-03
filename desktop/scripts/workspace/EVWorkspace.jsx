import React, { useEffect, useRef, useState } from 'react';
import { Markdown } from '../ui/components';
import { publicError, readPreference, writePreference } from '../shared/bridge';

export async function evRequest(input) {
  if (!window.cyroEV) throw Error('Espaços Virtuais indisponíveis nesta sessão.');
  const result = await window.cyroEV.request(input);
  if (result?.error) throw Object.assign(Error(result.error), { status: result.status });
  return result;
}
const stateLabel = (value) =>
  ({
    READY: 'Conectado',
    PROVISIONING: 'Preparando espaço…',
    ERROR: 'Aguardando recuperação',
    ARCHIVED: 'Arquivado',
    UNPROVISIONED: 'Aguardando preparação',
    PENDING: 'Na fila',
    RUNNING: 'Processando…',
    DONE: 'Concluído',
  })[value] || value;
const operationLabel = (value) =>
  ({
    PROCESS_FILE: 'Leitura do arquivo',
    EXPORT_TABLE: 'Exportação',
    DUPLICATES: 'Duplicidades',
    COMPARE: 'Comparação',
    GROUP: 'Agrupamento',
    SUM: 'Soma',
  })[value] || value;
function FileLink({ file, projectId }) {
  const [error, setError] = useState('');
  return (
    <div className="ev-chat-file">
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          void window.cyroEV
            .download({ projectId, fileId: file.id })
            .catch((e) => setError(publicError(e)));
        }}
      >
        ↧ {file.name}
      </a>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
function DataTable({ item }) {
  return (
    <div className="ev-chat-table">
      <p>
        <strong>{item.name}</strong> <span>· {item.rowCount} registros</span>
      </p>
      <div className="ev-chat-table-scroll">
        <table>
          <thead>
            <tr>
              {item.columns.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {item.rows.map((row, index) => (
              <tr key={row.id || index}>
                {item.columns.map((c) => (
                  <td key={c.id}>{String(row.data[c.id] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>Prévia. Peça por mensagem para ver mais linhas, editar ou exportar.</small>
    </div>
  );
}
function FiscalData({ data }) {
  return (
    <div className="ev-chat-table">
      <p>
        <strong>
          {data.documentType} · {data.number || 'Número não informado'}
        </strong>
      </p>
      <table>
        <tbody>
          {[
            ['Chave', data.accessKey],
            ['Emitente', data.emit?.name],
            ['CNPJ emitente', data.emitCnpj],
            ['Destinatário', data.dest?.name],
            ['CNPJ destinatário', data.destCnpj],
            ['Valor do documento', data.total],
            ['Valor da carga', data.cargoValue],
            ['Peso (kg)', data.weight],
          ].map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{value ?? 'Não informado'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>Extração de dados; sem validação fiscal oficial.</small>
    </div>
  );
}
function Analysis({ item, projectId, hidden }) {
  const [job, setJob] = useState(item),
    [error, setError] = useState('');
  useEffect(() => {
    if (hidden || ['DONE', 'ERROR'].includes(job.state)) return;
    let disposed = false;
    const timer = setTimeout(
      () =>
        void evRequest({ action: 'analysis.get', projectId, id: item.id })
          .then((out) => {
            if (!disposed) setJob(out.analysis);
          })
          .catch((e) => {
            if (!disposed) setError(publicError(e));
          }),
      1800,
    );
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [job, hidden]);
  const result = job.result;
  return (
    <div className="ev-chat-result">
      <p>
        <strong>{operationLabel(job.kind)}</strong> · {stateLabel(job.state)}
      </p>
      {error && <p role="alert">{error} Peça ao Cyro para recuperar esta análise.</p>}
      {job.error && (
        <p role="alert">
          Não foi possível concluir: {job.error}. Peça ao Cyro para verificar o arquivo ou tentar
          novamente.
        </p>
      )}
      {result?.file && <FileLink file={result.file} projectId={projectId} />}
      {result?.type === 'FISCAL' && <FiscalData data={result} />}
      {result?.type === 'SPREADSHEET' &&
        result.tables?.map((t) => (
          <p key={t.id}>
            Importada: <strong>{t.name}</strong>, {t.rowCount} registros. Peça ao Cyro para mostrar
            ou analisar a tabela.
          </p>
        ))}
      {result?.text && (
        <p className="ev-extracted-text">
          {result.text.slice(0, 3000)}
          {result.text.length > 3000 ? '…' : ''}
        </p>
      )}
      {result?.total !== undefined && (
        <p>
          <strong>Total: {result.total}</strong> · {result.counted} valores considerados.
        </p>
      )}
      {result?.groups && (
        <div className="ev-chat-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Identificação</th>
                <th>Registros</th>
                <th>Total disponível</th>
              </tr>
            </thead>
            <tbody>
              {result.groups.slice(0, 50).map((g) => (
                <tr key={g.key}>
                  <td>{g.key}</td>
                  <td>{g.count}</td>
                  <td>{g.total ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {[
        ['onlyFirst', 'Somente na primeira fonte'],
        ['onlySecond', 'Somente na segunda fonte'],
        ['different', 'Valores divergentes'],
      ].map(
        ([key, label]) =>
          result?.[key] && (
            <div key={key}>
              <p>
                {label}: {result[key].length}
              </p>
              <ul>
                {result[key].slice(0, 20).map((g) => (
                  <li key={g.key}>{g.key}</li>
                ))}
              </ul>
            </div>
          ),
      )}
      {result?.warnings?.map((w, i) => (
        <small key={i}>{w}</small>
      ))}
    </div>
  );
}
function Batch({ item, projectId, hidden }) {
  const [jobs, setJobs] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (
      hidden ||
      error ||
      (jobs.length === item.ids.length && jobs.every((j) => ['DONE', 'ERROR'].includes(j.state)))
    )
      return;
    let disposed = false;
    const timer = setTimeout(
      () =>
        void evRequest({ action: 'analyses.status', projectId, ids: item.ids })
          .then((out) => {
            if (!disposed) setJobs(out.jobs);
          })
          .catch((e) => {
            if (!disposed) setError(publicError(e));
          }),
      1800,
    );
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [jobs, hidden, error]);
  const done = jobs.filter((j) => j.state === 'DONE').length,
    failed = jobs.filter((j) => j.state === 'ERROR').length;
  return (
    <div className="ev-chat-result">
      <p>
        <strong>Leitura de {item.count} arquivos</strong> · {done} concluídos
        {failed ? ` · ${failed} com falha` : ''}
      </p>
      {error && <p role="alert">{error}</p>}
      {jobs.some((j) => j.result?.type === 'FISCAL') && (
        <div className="ev-chat-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Número</th>
                <th>CNPJ emitente</th>
                <th>CNPJ destinatário</th>
                <th>Valor</th>
                <th>Peso (kg)</th>
              </tr>
            </thead>
            <tbody>
              {jobs
                .filter((j) => j.result?.type === 'FISCAL')
                .map((j) => (
                  <tr key={j.id}>
                    {[
                      j.result.documentType,
                      j.result.number,
                      j.result.emitCnpj,
                      j.result.destCnpj,
                      j.result.total,
                      j.result.weight,
                    ].map((value, index) => (
                      <td key={index}>{value ?? '—'}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {jobs
        .flatMap((j) => j.result?.tables || [])
        .map((t) => (
          <p key={t.id}>
            Tabela disponível: {t.name}, {t.rowCount} registros.
          </p>
        ))}
      <small>
        Os originais permanecem preservados. Extração não equivale a validação fiscal oficial.
      </small>
    </div>
  );
}
function Artifact({ item, projectId, hidden }) {
  if (item.type === 'TABLE') return <DataTable item={item} />;
  if (item.type === 'FILE' || item.type === 'DOWNLOAD')
    return <FileLink file={item.file} projectId={projectId} />;
  if (item.type === 'ANALYSIS')
    return <Analysis item={item} projectId={projectId} hidden={hidden} />;
  if (item.type === 'BATCH') return <Batch item={item} projectId={projectId} hidden={hidden} />;
  if (item.type === 'PROPOSAL' && ['APPLIED', 'REJECTED'].includes(item.state)) return <p className="ev-chat-notice"><strong>{item.state === 'APPLIED' ? 'Alteração aplicada.' : 'Proposta rejeitada.'}</strong> {item.summary}</p>;
  if (item.type === 'PROPOSAL')
    return (
      <div className="ev-chat-proposal">
        <strong>
          {item.state === 'APPLIED'
            ? 'Alteração aplicada'
            : item.state === 'REJECTED'
              ? 'Proposta rejeitada'
              : item.state === 'APPLYING'
                ? 'Aplicando alteração…'
                : 'Alteração proposta · ainda não aplicada'}
        </strong>
        <p>{item.summary}</p>
        {item.changes?.map((change, index) => (
          <p key={index}>
            <strong>{change.label}</strong>
            <br />
            <span>{String(change.before ?? 'Vazio')}</span> →{' '}
            <span>{String(change.after ?? 'Vazio')}</span>
          </p>
        ))}
        {(!item.state || item.state === 'PROPOSED') && (
          <p>
            Responda <strong>confirmar</strong> para aplicar ou <strong>rejeitar</strong> para
            cancelar.
          </p>
        )}
      </div>
    );
  return null;
}

export function EVWorkspace({ hidden, onDirty = () => {} }) {
  const [space, setSpace] = useState(null),
    [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]),
    [artifacts, setArtifacts] = useState([]),
    [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [contextFiles, setContextFiles] = useState([]);
  const confirmation = useRef(null);
  const proposalContext = () =>
    [...artifacts]
      .sort((a, b) => a.messageId - b.messageId)
      .flatMap((group) => group.items)
      .filter(
        (item) =>
          item.type === 'PROPOSAL' &&
          (!item.state || ['PROPOSED', 'APPLYING'].includes(item.state)),
      )
      .at(-1)?.id;
  const initialized = useRef(false),
    operation = useRef(null),
    generation = useRef(0),
    scroll = useRef(null),
    input = useRef(null),
    active = useRef(true),
    sending = useRef(false);
  useEffect(
    () => () => {
      active.current = false;
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    const pending = !!question.trim() || loading;
    onDirty(pending);
    void window.cyroEV?.dirty?.(pending)?.catch(() => {});
  }, [question, loading]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo?.({ top: scroll.current.scrollHeight, behavior: 'auto' }));
    return () => cancelAnimationFrame(frame);
  }, [messages, artifacts, loading]);
  async function apply(out) {
    if (!active.current) return;
    if (out.effect === 'LOBBY') {
      setSpace(null);
      setConversation(null);
      setArtifacts([]);
      setContextFiles([]);
      setMessages([{ id: 'entry', role: 'assistant', content: out.reply }]);
      writePreference('cyro.ev.selection', {});
      return;
    }
    if (out.space) {
      if (out.space.id !== space?.id) setContextFiles([]);
      setSpace(out.space);
      if (out.ownerId)
        writePreference('cyro.ev.selection', { ownerId: out.ownerId, projectId: out.space.id });
    }
    if (out.conversation) setConversation(out.conversation);
    if (out.messages) {
      setMessages(out.messages);
      setArtifacts(out.artifacts || []);
    } else if (out.reply)
      setMessages((old) => [
        ...old,
        { id: 'reply-' + crypto.randomUUID(), role: 'assistant', content: out.reply },
      ]);
    if (out.effect === 'OPEN_SPACE' && out.space?.state === 'READY')
      await apply(await evRequest({ action: 'assistant.open', projectId: out.space.id }));
  }
  async function open(projectId, conversationId) {
    const epoch = ++generation.current;
    const out = await evRequest({
      action: 'assistant.open',
      projectId,
      ...(conversationId ? { conversationId } : {}),
    });
    if (!active.current || epoch !== generation.current) return;
    await apply(out);
    if (out.space?.state === 'READY') {
      const draft = await window.cyroEV.draft({ channel: 'CHAT', operation: 'read', projectId });
      if (draft?.question && epoch === generation.current) {
        if (draft.conversationId && draft.conversationId !== out.conversation?.id)
          await apply(
            await evRequest({
              action: 'assistant.open',
              projectId,
              conversationId: draft.conversationId,
            }),
          );
        setQuestion((old) => old || draft.question);
        setContextFiles(draft.fileIds || []);
        operation.current = draft.operationId;
        confirmation.current = draft.confirmationProposalId || null;
        setNotice('Rascunho recuperado. Revise a mensagem antes de enviar.');
      }
    }
  }
  useEffect(() => {
    if (hidden || initialized.current || !window.cyroEV) return;
    initialized.current = true;
    const saved = readPreference('cyro.ev.selection', {});
    if (!saved.projectId) return;
    setLoading(true);
    void evRequest({ action: 'list' })
      .then((out) => {
        if (out.ownerId === saved.ownerId && out.spaces.some((s) => s.id === saved.projectId))
          return open(saved.projectId);
      })
      .catch((e) => setError(publicError(e)))
      .finally(() => setLoading(false));
  }, [hidden]);
  useEffect(() => {
    if (hidden || !space || space.state !== 'PROVISIONING' || loading) return;
    const timer = setTimeout(() => {
      setLoading(true);
      void open(space.id)
        .catch((e) => setError(publicError(e)))
        .finally(() => setLoading(false));
    }, 2000);
    return () => clearTimeout(timer);
  }, [hidden, space, loading]);
  useEffect(() => {
    if (!question.trim() || !space || !conversation) return;
    const timer = setTimeout(
      () =>
        void window.cyroEV
          .draft({
            channel: 'CHAT',
            operation: 'write',
            projectId: space.id,
            content: {
              kind: 'CHAT',
              conversationId: conversation.id,
              question,
              fileIds: contextFiles,
              confirmationProposalId: (confirmation.current ||= proposalContext()),
              operationId: (operation.current ||= crypto.randomUUID()),
            },
          })
          .catch((e) => setError(publicError(e))),
      250,
    );
    return () => clearTimeout(timer);
  }, [question, conversation, contextFiles]);
  async function send(event) {
    event.preventDefault();
    if (sending.current || !question.trim()) return;
    sending.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    const text = question,
      previousSpace = space,
      operationId = (operation.current ||= crypto.randomUUID());
    try {
      const out = await evRequest({
        action: 'assistant.send',
        operationId,
        message: text,
        ...(space ? { projectId: space.id } : {}),
        ...(conversation ? { conversationId: conversation.id } : {}),
        fileIds: contextFiles.slice(0, 5),
        ...(confirmation.current || proposalContext()
          ? { confirmationProposalId: (confirmation.current ||= proposalContext()) }
          : {}),
      });
      if (!active.current) return;
      if (!out.messages)
        setMessages((old) =>
          old.some((m) => m.id === 'user-' + operationId)
            ? old
            : [...old, { id: 'user-' + operationId, role: 'user', content: text }],
        );
      await apply(out);
      setQuestion('');
      operation.current = null;
      confirmation.current = null;
      if (previousSpace)
        await window.cyroEV.draft({
          channel: 'CHAT',
          operation: 'remove',
          projectId: previousSpace.id,
        });
      if (out.effect === 'CLEAR_CONTEXT') setContextFiles([]);
      if ((out.effect === 'UPLOAD' || out.effects?.some((e) => e.type === 'UPLOAD')) && out.space) {
        const uploaded = await window.cyroEV.upload(out.space.id);
        if (uploaded.files?.length) {
          setContextFiles(uploaded.files.slice(0, 5).map((f) => f.id));
          setNotice(
            `${uploaded.files.length} arquivo(s) enviado(s). Agora diga ao Cyro o que deseja fazer com eles.`,
          );
        }
        if (uploaded.failures?.length)
          setError(uploaded.failures.map((f) => f.name + ': ' + f.error).join('\n'));
      }
      for (const effect of out.effects || [])
        if (effect.type === 'DOWNLOAD')
          await window.cyroEV.download({ projectId: out.space.id, fileId: effect.file.id });
    } catch (e) {
      if (active.current) {
        setError(publicError(e));
        setQuestion((old) => old || text);
      }
    } finally {
      sending.current = false;
      if (active.current) {
        setLoading(false);
        input.current?.focus();
      }
    }
  }
  return (
    <section
      className="ev-chat main-panel"
      hidden={hidden}
      aria-label="Espaço Virtual por conversa"
      aria-busy={loading}
    >
      <header className="ev-chat-heading">
        <div>
          <span>CYRO EV · LOGÍSTICO</span>
          <h1>{space?.name || 'Espaços Virtuais'}</h1>
        </div>
        <small role="status">
          {loading ? 'Cyro está trabalhando…' : stateLabel(space?.state) || 'Converse com o Cyro'}
        </small>
      </header>
      <div className="ev-chat-history" ref={scroll} aria-live="polite">
        {!messages.length && (
          <div className="ev-chat-welcome">
            <h2>
              {space ? 'O que vamos fazer neste espaço?' : 'Seu trabalho começa com uma conversa.'}
            </h2>
            <p>
              {space
                ? 'Peça para enviar arquivos, conferir notas, criar uma tabela ou comparar planilhas. O Cyro organiza os dados e mantém o contexto deste espaço.'
                : 'Diga “crie um espaço chamado Transportadora ABC” ou “liste meus espaços”.'}
            </p>
          </div>
        )}
        {messages.map((message) => (
          <article className={'ev-chat-message ' + message.role} key={message.id}>
            <span>{message.role === 'user' ? 'Você' : 'Cyro'}</span>
            <Markdown text={message.content} />
            {artifacts
              .filter((a) => a.messageId === message.id)
              .flatMap((a) => a.items)
              .map((item, index) => (
                <Artifact
                  key={item.id || item.file?.id || index}
                  item={item}
                  projectId={space?.id}
                  hidden={hidden}
                />
              ))}
          </article>
        ))}
        {notice && (
          <p className="ev-chat-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="ev-chat-error" role="alert">
            {error}{' '}
            {question.trim()
              ? 'Sua mensagem foi preservada; tente enviá-la novamente.'
              : 'A conversa e os arquivos já enviados continuam preservados.'}
          </p>
        )}
        {loading && <p className="ev-chat-working">Cyro está trabalhando…</p>}
      </div>
      <form className="ev-chat-composer" onSubmit={send}>
        <label className="sr-only" htmlFor="ev-message">
          Mensagem ao Cyro
        </label>
        <textarea
          id="ev-message"
          ref={input}
          value={question}
          maxLength={6000}
          rows={2}
          disabled={loading}
          placeholder={space ? 'Peça ao Cyro…' : 'Crie ou abra um espaço por mensagem…'}
          onChange={(event) => {
            operation.current = null;
            confirmation.current = null;
            setQuestion(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(event);
            }
          }}
        />
        <button
          aria-label="Enviar mensagem ao Cyro"
          disabled={loading || !question.trim()}
          type="submit"
        >
          ↑
        </button>
      </form>
      <p className="ev-chat-hint">
        {contextFiles.length
          ? `${contextFiles.length} arquivo(s) como contexto. Diga “limpar anexos” para retirar a seleção.`
          : 'Para anexar, diga “enviar arquivos”.'}{' '}
        Enter para enviar · Shift+Enter para nova linha.
      </p>
    </section>
  );
}

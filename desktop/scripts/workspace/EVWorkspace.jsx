import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, Markdown } from '../ui/components';
import { publicError, writePreference } from '../shared/bridge';
import { Composer } from '../chat/Composer';
import { MessageCopy } from '../chat/Conversation';
import { AnchoredMenu, contextMenuAt, contextMenuHandlers } from '../ui/AnchoredMenu';
import { useDictation } from '../voice/hooks';
import { EVStudio } from './EVStudio';
import { EVCatalog, EVSDKNotice } from './EVCatalog';
import { Icon } from '../ui/Icon';

async function waitForIPC(promise, ms = 125000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                'A operação demorou mais que o esperado. O pedido foi preservado; tente novamente para recuperar o resultado.',
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function evRequest(input) {
  if (!window.cyroEV) throw Error('Espaços Virtuais indisponíveis nesta sessão.');
  const result = await waitForIPC(window.cyroEV.request(input));
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
function DataTable({ item, onOpen }) {
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
      <button type="button" className="ev-open-table" onClick={() => onOpen?.(item.id)}>
        Abrir tabela no painel
      </button>
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
            ['Frete declarado', data.freight?.value],
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
    if (hidden || (['DONE', 'ERROR'].includes(job.state) && Object.hasOwn(job, 'result'))) return;
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
function Artifact({ item, projectId, hidden, onOpen, onTable, onReference, onDecide, decisionDisabled }) {
  if (item.type === 'REFERENCES')
    return (
      <div className="ev-source-links" aria-label="Referências do EV">
        <small>Referências do EV</small>
        {item.references.map((reference) => (
          <button
            type="button"
            key={reference.rowId || reference.id}
            title={reference.name}
            onClick={() => onReference(reference)}
          >
            <Icon name={reference.kind === 'table' ? 'table' : 'text'} />
            <span>{reference.name}{reference.rowId ? ' · Abrir linha' : ''}</span>
          </button>
        ))}
      </div>
    );
  if (item.type === 'TABLE') return <DataTable item={item} onOpen={onTable} />;
  if (item.type === 'WORKBENCH')
    return (
      <div className="ev-studio-chat-card">
        <Icon name="folder" />
        <div>
          <strong>Recursos do seu EV</strong>
          <small>
            {item.files.length} arquivos · {item.tables.length} tabelas
          </small>
        </div>
        <button onClick={() => onOpen?.(item.panel)}>Abrir no painel</button>
      </div>
    );
  if (item.type === 'FILE' || item.type === 'DOWNLOAD')
    return <FileLink file={item.file} projectId={projectId} />;
  if (item.type === 'ANALYSIS')
    return <Analysis item={item} projectId={projectId} hidden={hidden} />;
  if (item.type === 'BATCH') return <Batch item={item} projectId={projectId} hidden={hidden} />;
  if (item.type === 'PROPOSAL' && ['APPLIED', 'REJECTED'].includes(item.state))
    return (
      <p className="ev-chat-notice">
        <strong>{item.state === 'APPLIED' ? 'Alteração aplicada.' : 'Proposta rejeitada.'}</strong>{' '}
        {item.summary}
      </p>
    );
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
          <div className="ev-manage-actions">
            <button type="button" disabled={decisionDisabled} onClick={() => onDecide(item.id, 'rejeitar')}>
              Rejeitar
            </button>
            <button type="button" disabled={decisionDisabled} onClick={() => onDecide(item.id, 'confirmar')}>
              Confirmar
            </button>
          </div>
        )}
      </div>
    );
  return null;
}

export function EVWorkspace({
  hidden,
  selectedEV = null,
  createRequest = 0,
  onCreated = () => {},
  onCancelCreation = () => {},
  onDirty = () => {},
  onSpaceChange = () => {},
  onManage = () => {},
  speaker,
  voiceEnabled = false,
}) {
  const [space, setSpace] = useState(null),
    [conversation, setConversation] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [copyMenu, setCopyMenu] = useState(null);
  useEffect(() => setCopyMenu(null), [hidden, space?.id, conversation?.id]);
  const chatCache = useRef(new Map());
  const [messages, setMessages] = useState([]),
    [pendingMessage, setPendingMessage] = useState(null),
    [artifacts, setArtifacts] = useState([]),
    [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [contextFiles, setContextFiles] = useState([]);
  const [attached, setAttached] = useState([]);
  const [extensionCatalog, setExtensionCatalog] = useState(null);
  const [selectedExtension, setSelectedExtension] = useState('');
  const activeExtension = extensionCatalog?.extensions?.find((item) => item.id === space?.extensionId);
  const theme = activeExtension?.theme;
  const themeColor = (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
    ? color : undefined;
  const newSpaceExtension = extensionCatalog?.extensions?.find((item) => item.id === selectedExtension);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [creationOpen, setCreationOpen] = useState(false);
  const creationOperation = useRef(null);
  useEffect(() => {
    if (!hidden && createRequest) {
      setCatalogOpen(false);
      setCreationOpen(true);
      void refreshExtensions();
    }
  }, [createRequest]);
  async function refreshExtensions() {
    try {
      const result = await evRequest({ action: 'catalog' });
      if (Array.isArray(result?.extensions)) {
        setExtensionCatalog(result);
        setSpace((current) => {
          const extension = result.extensions.find(
            (item) => item.id === current?.extensionId && item.installed,
          );
          if (
            !current ||
            !extension?.installedVersion ||
            current.extensionVersion === extension.installedVersion
          )
            return current;
          return { ...current, extensionVersion: extension.installedVersion };
        });
        setCatalogError('');
      }
    } catch (e) {
      setCatalogError(publicError(e));
    }
  }
  useEffect(() => {
    if (hidden) return;
    const update = () => {
      if (document.visibilityState !== 'hidden') void refreshExtensions();
    };
    update();
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [hidden]);
  async function manageExtension(extension, install) {
    if (loading || sending.current) return;
    setLoading(true);
    setCatalogError('');
    try {
      const result = await evRequest({
        action: install ? 'extension.install' : 'extension.uninstall',
        extensionId: extension.id,
        operationId: crypto.randomUUID(),
      });
      setExtensionCatalog(result);
      if (install) setSelectedExtension(extension.id);
      else if (selectedExtension === extension.id) setSelectedExtension('');
      setNotice(
        install
          ? `${extension.name} instalada na sua conta.`
          : `${extension.name} desinstalada. Os dados dos espaços foram preservados.`,
      );
    } catch (e) {
      setCatalogError(publicError(e));
    } finally {
      if (active.current) setLoading(false);
    }
  }
  async function createSpace(event) {
    event.preventDefault();
    if (loading || !selectedExtension || !newSpaceName.trim() || !extensionCatalog?.enabled) return;
    setLoading(true);
    setError('');
    try {
      const result = await evRequest({
        action: 'create',
        operationId: (creationOperation.current ||= crypto.randomUUID()),
        extensionId: selectedExtension,
        name: newSpaceName.trim(),
        description: '',
      });
      await apply({ ...result, effect: 'OPEN_SPACE' });
      onCreated(result.space);
      setCreationOpen(false);
      creationOperation.current = null;
      setNewSpaceName('');
    } catch (e) {
      setError(publicError(e));
    } finally {
      if (active.current) setLoading(false);
    }
  }
  useEffect(() => {
    onSpaceChange(space?.id || null);
  }, [space?.id]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [studioWidth, setStudioWidth] = useState(26);
  const resizeStart = useRef(null);
  const clampStudio = (width) => Math.max(16, Math.min(30, width));
  const studio = useRef(null);
  const [studioPending, setStudioPending] = useState(false);
  const openStudioCode = useCallback((payload) => studio.current?.openCode(payload), []);
  const runStudioCode = useCallback((payload) => studio.current?.runCode(payload), []);
  const changeQuestion = (value) => {
    operation.current = null;
    confirmation.current = null;
    setQuestion(value.slice(0, 6000));
  };
  const dictation = useDictation((text) => {
    if (!hidden && !sending.current) changeQuestion((question ? question + ' ' : '') + text);
  }, setNotice);
  const confirmation = useRef(null);
  const decisionBlocked = !!contextFiles.length ||
    (!!question.trim() && !/^(?:eu\s+)?(?:confirmar|confirmo|rejeitar|rejeito|cancelar)[.!]?$/i.test(question.trim()));
  useEffect(() => {
    if (hidden || loading) dictation.stop();
  }, [hidden, loading]);
  const operation = useRef(null),
    generation = useRef(0),
    scroll = useRef(null),
    input = useRef(null),
    active = useRef(true),
    sending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    const pending = !!question.trim() || contextFiles.length > 0 || loading;
    onDirty(pending || studioPending);
    void window.cyroEV?.dirty?.(pending || studioPending)?.catch(() => {});
  }, [question, contextFiles, loading, studioPending]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo?.({ top: scroll.current.scrollHeight, behavior: 'auto' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [messages, pendingMessage, artifacts, loading]);
  async function apply(out) {
    if (!active.current) return;
    if (out.effect === 'CREATE_EV') {
      setCreationOpen(true);
      void refreshExtensions();
      return;
    }
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
      if (out.space.id !== space?.id) {
        setContextFiles([]);
        setConversations([]);
        setConversation(null);
        setMessages([]);
        setArtifacts([]);
      }
      setSpace(out.space);
      if (out.ownerId)
        writePreference('cyro.ev.selection', { ownerId: out.ownerId, projectId: out.space.id });
    }
    if (out.conversations) setConversations(out.conversations);
    if (Object.hasOwn(out, 'conversation')) {
      setConversation(out.conversation);
      if (out.conversation)
        setConversations((old) => [
          out.conversation,
          ...old.filter((c) => c.id !== out.conversation.id),
        ]);
    }
    if (out.space && out.conversation && out.messages) {
      const key = out.space.id + ':' + out.conversation.id;
      chatCache.current.delete(key);
      chatCache.current.set(key, out);
      const cacheBytes = () =>
        [...chatCache.current.values()].reduce(
          (total, value) =>
            total +
            JSON.stringify({ messages: value.messages, artifacts: value.artifacts }).length * 2,
          0,
        );
      while (
        chatCache.current.size > 12 ||
        (chatCache.current.size > 1 && cacheBytes() > 8 * 1024 * 1024)
      )
        chatCache.current.delete(chatCache.current.keys().next().value);
    }
    if (out.messages) {
      setMessages(out.messages);
      setArtifacts(out.artifacts || []);
    } else if (out.reply)
      setMessages((old) => [
        ...old,
        { id: 'reply-' + crypto.randomUUID(), role: 'assistant', content: out.reply },
      ]);
    if (out.effect === 'OPEN_SPACE' && out.space?.state === 'READY')
      await apply(
        await evRequest({
          action: 'assistant.open',
          projectId: out.space.id,
          ...(out.space.chatId ? { conversationId: out.space.chatId } : {}),
          metadataOnly: false,
        }),
      );
  }
  async function open(projectId, conversationId) {
    const epoch = ++generation.current;
    const cached = conversationId && chatCache.current.get(projectId + ':' + conversationId);
    const out =
      cached ||
      (await evRequest({
        action: 'assistant.open',
        metadataOnly: false,
        projectId,
        ...(conversationId ? { conversationId } : {}),
      }));
    if (!active.current || epoch !== generation.current) return;
    await apply(out);
    if (out.space?.state === 'READY') {
      const draft = await waitForIPC(
        window.cyroEV.draft({ channel: 'CHAT', operation: 'read', projectId }),
        8000,
      );
      if ((draft?.question || draft?.fileIds?.length) && epoch === generation.current) {
        if (draft.conversationId && draft.conversationId !== out.conversation?.id) {
          setNotice('Há um rascunho preservado. Abra a conversa correspondente para recuperá-lo.');
          return;
        }
        setQuestion((old) => old || draft.question || '');
        setContextFiles(draft.fileIds || []);
        const recovered = await Promise.allSettled(
          (draft.fileIds || [])
            .slice(0, 5)
            .map((id) => evRequest({ action: 'file.get', projectId, id })),
        );
        if (epoch === generation.current)
          setAttached(recovered.filter((r) => r.status === 'fulfilled').map((r) => r.value.file));
        operation.current = draft.operationId;
        confirmation.current = draft.confirmationProposalId || null;
        setNotice('Rascunho recuperado. Revise a mensagem antes de enviar.');
      }
    }
  }
  useEffect(() => {
    if (hidden || !selectedEV?.id || !window.cyroEV) return;
    if (
      selectedEV.id === space?.id &&
      space.state === 'READY' &&
      conversation?.id === selectedEV.chatId
    )
      return;
    setLoading(true);
    void open(selectedEV.id, selectedEV.chatId)
      .catch((e) => setError(publicError(e)))
      .finally(() => setLoading(false));
  }, [hidden, selectedEV?.id, selectedEV?.chatId]);
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
    if (sending.current || (!question.trim() && !contextFiles.length) || !space) return;
    const timer = setTimeout(
      () =>
        void window.cyroEV
          .draft({
            channel: 'CHAT',
            operation: 'write',
            projectId: space.id,
            content: {
              kind: 'CHAT',
              conversationId: conversation?.id || null,
              question,
              fileIds: contextFiles,
              confirmationProposalId: confirmation.current,
              operationId: (operation.current ||= crypto.randomUUID()),
            },
          })
          .catch((e) => setError(publicError(e))),
      250,
    );
    return () => clearTimeout(timer);
  }, [question, conversation, contextFiles]);
  async function upload(projectId) {
    const uploaded = await window.cyroEV.upload(projectId);
    if (!active.current) return;
    if (uploaded.files?.length) {
      operation.current = null;
      confirmation.current = null;
      setAttached((old) =>
        [...old.filter((f) => !uploaded.files.some((n) => n.id === f.id)), ...uploaded.files].slice(
          -5,
        ),
      );
      setContextFiles((old) =>
        [...new Set([...old, ...uploaded.files.map((f) => f.id)])].slice(-5),
      );
      setNotice(
        `${uploaded.files.length} arquivo(s) enviado(s) ao espaço. Até 5 ficam selecionados como contexto da mensagem.`,
      );
    }
    if (uploaded.failures?.length)
      setError(uploaded.failures.map((f) => f.name + ': ' + f.error).join('\n'));
  }
  async function chooseAttachments() {
    if (loading || sending.current) return;
    if (!space || space.state !== 'READY') {
      setNotice('Crie ou abra um espaço antes de anexar arquivos.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await upload(space.id);
    } catch (e) {
      setError(publicError(e));
    } finally {
      if (active.current) setLoading(false);
    }
  }
  async function send(event, decision) {
    event?.preventDefault();
    if (sending.current || loading || (!decision && !question.trim() && !contextFiles.length)) return;
    if (decision) {
      if (decisionBlocked) return;
      if (confirmation.current !== decision.id || question.trim() !== decision.text)
        operation.current = null;
      confirmation.current = decision.id;
    }
    sending.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    const text = decision?.text || question.trim() || 'Analise os arquivos anexados.',
      previousSpace = space,
      operationId = (operation.current ||= crypto.randomUUID());
    const submittedMessage = { id: 'user-' + operationId, role: 'user', content: text };
    try {
      if (
        !space &&
        extensionCatalog?.enabled &&
        /(?:criar|crie|novo|nova)\s+(?:um\s+)?(?:ev|espaço)/i.test(text) &&
        !selectedExtension
      )
        throw Error('Escolha o tipo do novo espaço antes de criar.');
      const selectedConversation = conversation;
      if (space?.state === 'READY' && !selectedConversation)
        throw Error('Reabra este EV para carregar seu chat antes de enviar.');
      setPendingMessage(submittedMessage);
      setQuestion('');
      if (space?.state === 'READY') {
        const draft = (id) =>
          window.cyroEV.draft({
            channel: 'CHAT',
            operation: 'write',
            projectId: space.id,
            content: {
              kind: 'CHAT',
              conversationId: id || null,
              question: text,
              fileIds: contextFiles.slice(0, 5),
              operationId,
              confirmationProposalId: confirmation.current || null,
            },
          });
        await waitForIPC(draft(selectedConversation.id), 8000);
      }
      const out = await evRequest({
        action: 'assistant.send',
        operationId,
        message: text,
        ...(space ? { projectId: space.id } : {}),
        ...(selectedConversation ? { conversationId: selectedConversation.id } : {}),
        fileIds: contextFiles.slice(0, 5),
        ...(!space && selectedExtension ? { extensionId: selectedExtension } : {}),
        ...(confirmation.current
          ? { confirmationProposalId: confirmation.current }
          : {}),
      });
      if (!active.current) return;
      setPendingMessage(null);
      if (!out.messages)
        setMessages((old) =>
          old.some((m) => m.id === submittedMessage.id) ? old : [...old, submittedMessage],
        );
      await apply(out);
      setContextFiles([]);
      operation.current = null;
      confirmation.current = null;
      // Local cleanup must not keep a completed server response in the sending state.
      if (previousSpace)
        void window.cyroEV
          .draft({
            channel: 'CHAT',
            operation: 'remove',
            projectId: previousSpace.id,
          })
          .catch((e) => {
            if (active.current) setNotice('Mensagem enviada. ' + publicError(e));
          });
      if (out.effect === 'CLEAR_CONTEXT') setContextFiles([]);
      void (async () => {
        if ((out.effect === 'UPLOAD' || out.effects?.some((e) => e.type === 'UPLOAD')) && out.space)
          await upload(out.space.id);
        for (const effect of out.effects || [])
          if (effect.type === 'DOWNLOAD')
            await window.cyroEV.download({ projectId: out.space.id, fileId: effect.file.id });
      })().catch((e) => {
        if (active.current) setNotice('Mensagem enviada. ' + publicError(e));
      });
      if (voiceEnabled && speaker) {
        const reply =
          out.reply ||
          [...(out.messages || [])].reverse().find((m) => m.role === 'assistant')?.content;
        if (reply) void speaker.speak(reply).catch((e) => setNotice(publicError(e)));
      }
    } catch (e) {
      if (active.current) {
        setPendingMessage(null);
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
    <>
      <EVCatalog
        open={!hidden && catalogOpen}
        catalog={extensionCatalog}
        busy={loading}
        error={catalogError}
        onRefresh={() => void refreshExtensions()}
        onManage={(extension, install) => void manageExtension(extension, install)}
        onBack={() => {
          setCatalogOpen(false);
          setCreationOpen(true);
        }}
        onUse={(extension) => {
          creationOperation.current = null;
          setSelectedExtension(extension.id);
          setCatalogOpen(false);
          setCreationOpen(true);
        }}
      />
      <Dialog
        id="ev-create-menu"
        title="Novo Espaço Virtual"
        open={!hidden && creationOpen}
        onClose={() => {
          if (!loading) {
            setCreationOpen(false);
            if (!space) onCancelCreation();
          }
        }}
      >
        <div className="ev-create-intro">
          <span className="ev-create-icon">
            <Icon name="folder-plus" />
          </span>
          <p>Um chat dedicado ao seu trabalho, com memória e arquivos privados.</p>
        </div>
        <form
          className="ev-extension-create"
          onSubmit={createSpace}
          aria-label="Criar Espaço Virtual"
        >
          <label>
            Tipo do novo espaço
            <select
              aria-label="Tipo do novo espaço"
              disabled={loading}
              value={selectedExtension}
              onChange={(event) => {
                creationOperation.current = null;
                setSelectedExtension(event.target.value);
              }}
            >
              <option value="">Escolha um tipo instalado</option>
              {extensionCatalog?.extensions
                .filter((item) => item.installed)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <EVSDKNotice extension={newSpaceExtension} sdkVersion={extensionCatalog?.sdkVersion} />
          <label>
            Nome do espaço
            <input
              aria-label="Nome do espaço"
              maxLength={120}
              placeholder="Ex.: Minha transportadora"
              autoFocus
              value={newSpaceName}
              disabled={loading}
              onChange={(event) => {
                creationOperation.current = null;
                setNewSpaceName(event.target.value);
              }}
            />
          </label>
          <p className="ev-create-hint">Escolha um tipo instalado ou explore outros no catálogo.</p>
          <div className="ev-menu-actions">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setCreationOpen(false);
                setCatalogOpen(true);
              }}
            >
              Explorar catálogo
            </button>
            <button
              className="ev-primary-action"
              disabled={
                loading || !selectedExtension || !newSpaceName.trim() || !extensionCatalog?.enabled
              }
            >
              {loading ? 'Criando…' : 'Criar EV'}
            </button>
          </div>
        </form>
        {catalogError && <p role="alert">{catalogError}</p>}
        {creationOpen && error && <p role="alert">{error}</p>}
        {extensionCatalog && !extensionCatalog.enabled && (
          <p>O catálogo de EVs ainda não foi ativado neste servidor.</p>
        )}
      </Dialog>

      {space && (
        <section
          className={'ev-chat main-panel' + (notesOpen ? ' has-notes' : '')}
          style={{
            '--ev-studio-width': studioWidth + 'vw',
            '--ev-chat-color': themeColor(theme?.chatColor),
            '--ev-studio-color': themeColor(theme?.studioColor),
          }}
          hidden={hidden}
          aria-label="Espaço Virtual por conversa"
          aria-busy={loading}
        >
          <header className="ev-chat-heading">
            <div>
              <span>
                {activeExtension?.name || 'CYRO EV'}
              </span>
              <h1>{space?.name || 'Espaços Virtuais'}</h1>
              <EVSDKNotice extension={activeExtension} sdkVersion={extensionCatalog?.sdkVersion} />
            </div>
            <small role="status">
              {loading
                ? 'Cyro está trabalhando…'
                : (stateLabel(space?.state) || 'Converse com o Cyro') +
                  (space?.extensionVersion ? ` · v${space.extensionVersion}` : '')}
            </small>
            <button
              type="button"
              className="ev-notes-toggle ev-studio-toggle"
              aria-label="Studio"
              title="Studio"
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen((old) => !old)}
            >
              <Icon name="folder" />
              <span>Studio</span>
            </button>
            <button
              type="button"
              className="ev-notes-toggle"
              aria-label="Opções do EV"
              title="Opções do EV"
              disabled={loading}
              onClick={() => onManage(space)}
            >
              <Icon name="gear" />
            </button>
          </header>
          <div className="ev-chat-history" ref={scroll} aria-live="polite">
            {!messages.length && !pendingMessage && (
              <div className="ev-chat-welcome">
                <h2>Como posso ajudar neste EV?</h2>
                <p>
                  {space
                    ? 'Peça para enviar arquivos, conferir notas, criar uma tabela ou comparar planilhas. O Cyro organiza os dados e mantém o contexto deste espaço.'
                    : 'Crie um Espaço Virtual com nome e tipo. Seus espaços aparecem na barra lateral.'}
                </p>
              </div>
            )}
            {(pendingMessage ? [...messages, pendingMessage] : messages).map((message) => (
              <article
                className={'ev-chat-message ' + message.role}
                key={message.id}
                tabIndex={0}
                {...contextMenuHandlers((event) =>
                  setCopyMenu({ ...contextMenuAt(event, 'Ações da mensagem'), text: message.content }),
                )}
              >
                <span>{message.role === 'user' ? 'Você' : 'Cyro'}</span>
                <Markdown
                  text={message.content}
                  onOpenCode={openStudioCode}
                  onRunCode={runStudioCode}
                />
                {artifacts
                  .filter((a) => a.messageId === message.id)
                  .flatMap((a) => a.items)
                  .map((item, index) => (
                    <Artifact
                      key={item.id || item.file?.id || index}
                      item={item}
                      onOpen={(intent) => studio.current?.openIntent(intent)}
                      onTable={(id) => studio.current?.openTable(id, 'space')}
                      onReference={(reference) => studio.current?.openReference(reference)}
                      onDecide={(id, text) => void send(null, { id, text })}
                      decisionDisabled={loading || decisionBlocked}
                      projectId={space?.id}
                      hidden={hidden}
                    />
                  ))}
              </article>
            ))}
            {copyMenu && (
              <AnchoredMenu menu={copyMenu} onClose={() => setCopyMenu(null)}>
                <MessageCopy key={copyMenu.text} text={copyMenu.text} />
              </AnchoredMenu>
            )}
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
          <div className="ev-chat-input">
            <Composer
              idPrefix="ev-"
              inputId="ev-message"
              state={{ ready: !hidden, busy: loading, chat: conversation }}
              writerState={{ busy: false }}
              isWriter={false}
              active={!hidden}
              busy={loading}
              canSend={!loading && !hidden && space?.state === 'READY'}
              input={question}
              inputRef={input}
              onInput={changeQuestion}
              onSend={send}
              disableInput={loading}
              cancelable={false}
              placeholder="Converse com o Cyro..."
              attachments={{
                files: contextFiles.map(
                  (id) =>
                    attached.find((f) => f.id === id) || {
                      id,
                      name: 'Arquivo selecionado',
                      kind: 'document',
                    },
                ),
                choose: chooseAttachments,
                remove: (id) => {
                  operation.current = null;
                  setContextFiles((old) => old.filter((item) => item !== id));
                },
                download: (fileId) => window.cyroEV.download({ projectId: space.id, fileId }),
                supportsImages: false,
                paste: async () => {
                  setNotice(
                    'Use o clipe para selecionar qualquer arquivo de até 8 MB para este espaço.',
                  );
                  return false;
                },
              }}
              dictation={dictation}
              onDictation={() => void dictation.toggle().catch((e) => setNotice(publicError(e)))}
              status={loading ? 'Cyro está trabalhando…' : notice || 'Pronto'}
              attachmentCaption="O arquivo enviado fica no seu EV. O conteúdo disponível para análise pode ser enviado à IA. Até 8 MB por arquivo."
            />
          </div>
          {notesOpen && (
            <div
              className="ev-studio-resize"
              role="separator"
              aria-label="Largura do Studio"
              aria-orientation="vertical"
              aria-valuemin={16}
              aria-valuemax={30}
              aria-valuenow={Math.round(studioWidth)}
              tabIndex={0}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                resizeStart.current = { x: event.clientX, width: studioWidth };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const start = resizeStart.current;
                if (start) setStudioWidth(clampStudio(start.width + (start.x - event.clientX) / window.innerWidth * 100));
              }}
              onLostPointerCapture={() => { resizeStart.current = null; }}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                setStudioWidth((width) => event.key === 'Home' ? 16 : event.key === 'End' ? 30 :
                  clampStudio(width + (event.key === 'ArrowLeft' ? 2 : -2)));
              }}
            />
          )}
          <EVStudio
            ref={studio}
            visible={notesOpen}
            onOpen={() => setNotesOpen(true)}
            onClose={() => setNotesOpen(false)}
            onPending={setStudioPending}
            key={space?.id || 'lobby'}
            projectId={space?.id}
            hidden={hidden}
            refreshKey={messages.length + ':' + contextFiles.join(',')}
            request={evRequest}
            onUse={(file) => {
              operation.current = null;
              confirmation.current = null;
              setAttached((old) => [...old.filter((f) => f.id !== file.id), file].slice(-5));
              setContextFiles((old) => [...new Set([...old, file.id])].slice(-5));
              input.current?.focus();
            }}
            renderFiscal={(data) => <FiscalData data={data} />}
            renderAnalysis={(item) =>
              item &&
              (item.kind === 'CHAT' ? (
                <Markdown text={item.reply || 'Resposta ainda não disponível.'} />
              ) : (
                <Analysis key={item.id} item={item} projectId={space?.id} hidden={hidden} />
              ))
            }
          />
        </section>
      )}
    </>
  );
}

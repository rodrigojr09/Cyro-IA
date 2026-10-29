import React, { useLayoutEffect, useRef, useState } from 'react';
import { Markdown } from '../ui/components';
import { AnchoredMenu } from '../ui/AnchoredMenu';
import { Icon } from '../ui/Icon';
import { AttachmentList } from '../attachment/components';
import { WriterProposal } from '../writer/WriterPreview';
import { post } from '../shared/bridge';
export function Conversation({
  state,
  writerState,
  isWriter,
  rows,
  writer,
  onRun,
  onRetry,
  children,
}) {
  const scroll = useRef(null),
    sticky = useRef(true),
    before = useRef(null),
    [atBottom, setAtBottom] = useState(true);
  const [copyMenu, setCopyMenu] = useState(null);
  const thinking = state.busy || writerState.busy;
  useLayoutEffect(() => setCopyMenu(null), [state.chat?.id]);
  useLayoutEffect(() => {
    if (thinking) sticky.current = true;
  }, [thinking]);
  useLayoutEffect(() => {
    const node = scroll.current,
      previous = before.current;
    if (previous && previous.chatId === state.chat?.id && state.visible > previous.visible)
      node.scrollTop = previous.top + node.scrollHeight - previous.height;
    else if (sticky.current || previous?.chatId !== state.chat?.id)
      node.scrollTop = rows.length ? node.scrollHeight : 0;
    before.current = {
      chatId: state.chat?.id,
      visible: state.visible,
      top: node.scrollTop,
      height: node.scrollHeight,
    };
    setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 100);
  }, [state.chat?.id, rows.length, state.visible, thinking]);
  return (
    <>
      <div
        id="conversation-scroll"
        ref={scroll}
        onScroll={() => {
          const node = scroll.current;
          sticky.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
          setAtBottom(sticky.current);
          if (before.current)
            before.current = { ...before.current, top: node.scrollTop, height: node.scrollHeight };
        }}
      >
        {children}
        <div id="messages" aria-label="Histórico da conversa" aria-live="polite">
          {rows.map((message, index) => (
            <article
              className={'message ' + message.role}
              tabIndex={0}
              onContextMenu={(event) => {
                event.preventDefault();
                setCopyMenu({
                  text: message.content,
                  trigger: event.currentTarget,
                  label: 'Ações da mensagem',
                  placement: 'below-end',
                  anchor: {
                    left: event.clientX,
                    right: event.clientX,
                    top: event.clientY,
                    bottom: event.clientY,
                  },
                });
              }}
              key={message.id ? 'message:' + message.id : 'temporary:' + index}
            >
              <div className="message-meta">
                <span>{message.role === 'user' ? 'Você' : 'Cyro'}</span>
                <MessageTime value={message.created_at || message.createdAt} />
              </div>
              {message.context_notice && (
                <small className="writer-context-note">{message.context_notice}</small>
              )}
              {message.role === 'user' ? (
                <p>{message.content}</p>
              ) : (
                <Markdown text={message.content} />
              )}
              <AttachmentList
                files={message.attachments}
                unavailable={message.attachments_unavailable}
              />
            </article>
          ))}
        </div>
        <div id="thinking" hidden={!thinking} role="status">
          <span className="pulse" />
          Cyro está pensando...
        </div>
        {!state.ready && (
          <div className="startup-status" role="status">
            <p>{state.status}</p>
            {state.error && (
              <button id="retry-startup" onClick={onRetry}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {state.pendingActions.map((action) => (
          <ActionConfirmation key={action.confirmation_id} action={action} onRun={onRun} />
        ))}
        {isWriter && <WriterProposal writer={writer} onRun={onRun} />}
      </div>
      {copyMenu && (
        <AnchoredMenu menu={copyMenu} onClose={() => setCopyMenu(null)}>
          <MessageCopy key={copyMenu.text} text={copyMenu.text} />
        </AnchoredMenu>
      )}
      <div className="conversation-navigation" hidden={atBottom}>
        <button
          id="jump-bottom"
          hidden={atBottom}
          onClick={() => {
            sticky.current = true;
            scroll.current.scrollTop = scroll.current.scrollHeight;
            setAtBottom(true);
          }}
        >
          Ir para a última mensagem ↓
        </button>
      </div>
    </>
  );
}
function MessageCopy({ text }) {
  const [label, setLabel] = useState('Copiar mensagem');
  return (
    <button
      className="message-copy"
      type="button"
      role="menuitem"
      aria-label={label}
      onClick={async () => {
        try {
          await window.jarvisWindow.copyCode(text);
          setLabel('Copiado');
        } catch {
          setLabel('Falha ao copiar');
        }
      }}
    >
      <Icon name="copy" />
      <span aria-live="polite" aria-atomic="true">
        {label}
      </span>
    </button>
  );
}
export function ActionConfirmation({ action, onRun }) {
  const [done, setDone] = useState(false),
    [status, setStatus] = useState('');
  return (
    <section className="confirmation">
      <p>{action.description || action.message || 'O Cyro solicita autorização para uma ação.'}</p>
      <button
        disabled={done}
        onClick={() =>
          onRun(async () => {
            const result = await post('/action/confirm', {
              confirmation_id: action.confirmation_id,
              approved: true,
            });
            setDone(true);
            setStatus(result.result || 'Ação processada.');
          })
        }
      >
        Confirmar abertura
      </button>
      <button
        disabled={done}
        onClick={() =>
          onRun(async () => {
            await post('/action/confirm', {
              confirmation_id: action.confirmation_id,
              approved: false,
            });
            setDone(true);
            setStatus('Ação cancelada.');
          })
        }
      >
        Cancelar
      </button>
      <p role="status">{status}</p>
    </section>
  );
}

function MessageTime({ value }) {
  if (!value) return null;
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString('pt-BR')}>
      {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    </time>
  );
}

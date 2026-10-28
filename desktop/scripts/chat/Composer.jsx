import React from 'react';
import { AttachmentList } from '../attachment/components';
import { Clipboard } from '../clipboard/Clipboard';
import { Icon } from '../ui/Icon';
export function Composer({
  state,
  writerState,
  isWriter,
  settings,
  library,
  busy,
  canSend,
  input,
  inputRef,
  onInput,
  onSend,
  attachments,
  dictation,
  onDictation,
  onCancel,
  onClearSelection,
  status,
}) {
  return (
    <footer className="composer-wrap">
      <Clipboard
        context={state.chat?.id || 'draft:' + (state.project?.id || 'general')}
        canClaim={state.ready && !busy && !settings && !library}
        onSend={onSend}
      />
      <div className="composer">
        <textarea
          id="input"
          ref={inputRef}
          value={input}
          maxLength={6000}
          rows={2}
          placeholder="Converse com o Cyro..."
          aria-label="Mensagem"
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void onSend();
            }
          }}
        />
        <div id="attachment-list">
          <AttachmentList
            files={attachments.files}
            onRemove={busy ? undefined : attachments.remove}
          />
        </div>
        <div className="composer-tools">
          <span id="composer-context">
            {isWriter ? (
              'Arquivo vinculado · Cyro Writer'
            ) : (
              <>
                <Icon name="shield" />
                Somente leitura
              </>
            )}
          </span>
          {isWriter && (
            <button id="writer-selection" onClick={onClearSelection}>
              {writerState.selectedIds.length
                ? 'Trecho selecionado · limpar ×'
                : 'Documento inteiro'}
            </button>
          )}
          <div className="composer-actions">
            <button
              id="attach-files"
              aria-label="Anexar arquivos"
              hidden={isWriter}
              disabled={!canSend || attachments.files.length >= 5}
              onClick={attachments.choose}
            >
              <Icon name="paperclip" />
            </button>
            <button
              id="microphone"
              aria-label="Ditar mensagem"
              aria-pressed={dictation.listening}
              disabled={!dictation.available || busy || !state.ready}
              title={
                dictation.available
                  ? 'Ditar mensagem'
                  : 'Entrada de voz indisponível neste Windows/runtime. Use o teclado.'
              }
              onClick={onDictation}
            >
              <Icon name="mic" />
            </button>
            <button
              id="cancel-response"
              aria-label="Cancelar resposta"
              hidden={!state.busy && !writerState.busy}
              onClick={onCancel}
            >
              ■
            </button>
            <button
              id="send"
              className="send-button"
              aria-label="Enviar mensagem"
              disabled={!canSend}
              onClick={() => void onSend()}
            >
              <Icon name="arrow-up" />
            </button>
          </div>
        </div>
      </div>
      <div className="composer-caption">
        <span id="status" role="status">
          {attachments.error || status}
        </span>
        <span>Enter para enviar · Shift+Enter para nova linha</span>
      </div>
      <p className="attachment-caption" hidden={isWriter}>
        Até 5 anexos de 5 MB cada. Originais ficam neste computador; a análise envia conteúdo à IA.
      </p>
      {state.storage?.cloud?.blocked && (
        <p className="storage-blocked" role="alert">
          Limite de memória na nuvem atingido. Apague alguns chats nas configurações para continuar
          usando o Cyro.
        </p>
      )}
    </footer>
  );
}

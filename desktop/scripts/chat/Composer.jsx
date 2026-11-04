import React, { useLayoutEffect } from 'react';
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
  idPrefix = '',
  inputId = 'input',
  placeholder = 'Converse com o Cyro...',
  attachmentCaption = 'Até 5 anexos de 5 MB cada. Originais ficam neste computador; a análise envia conteúdo à IA.',
  active = true,
  disableInput = false,
  cancelable = true,
}) {
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = '36px';
    field.style.height = Math.min(140, Math.max(36, field.scrollHeight)) + 'px';
  }, [input, inputRef]);
  return (
    <footer className="composer-wrap">
      <div className="composer-attachments">
        {active && (
          <Clipboard
            context={state.chat?.id || 'draft:' + (state.project?.id || 'general')}
            canClaim={active && state.ready && !busy && !settings && !library}
            onUseText={(text) => {
              const next = (input ? input + '\n' : '') + '(' + text + ')\n';
              if (next.length > 6000) return false;
              onInput(next);
              inputRef.current?.focus();
              return true;
            }}
            onAttachImage={
              !isWriter && attachments.supportsImages !== false
                ? async (dataURL) => {
                    const match =
                      /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(
                        dataURL,
                      );
                    if (!match) return false;
                    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
                    return attachments.paste(
                      [new window.File([bytes], 'Imagem copiada.png', { type: match[1] })],
                      !canSend ? 'Aguarde o chat ficar disponível para anexar.' : '',
                    );
                  }
                : undefined
            }
          />
        )}
        <div id={idPrefix + 'attachment-list'}>
          <AttachmentList
            files={attachments.files}
            onRemove={busy ? undefined : attachments.remove}
            onSave={attachments.download}
          />
        </div>
      </div>
      <div
        className="composer"
        onDragOver={(event) => {
          if ([...(event.dataTransfer?.types || [])].includes('Files')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = canSend && !isWriter ? 'copy' : 'none';
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const files = [...(event.dataTransfer?.files || [])];
          if (!files.length) return;
          void attachments.paste(
            files,
            isWriter
              ? 'Anexe arquivos nas conversas comuns.'
              : !canSend
                ? 'Aguarde o chat ficar disponível para anexar.'
                : '',
            'drop',
          );
        }}
      >
        <button
          id={idPrefix + 'attach-files'}
          className="attach-files"
          aria-label="Anexar arquivos"
          hidden={isWriter}
          disabled={!canSend || attachments.files.length >= 5}
          onClick={attachments.choose}
        >
          <Icon name="paperclip" />
        </button>
        <textarea
          id={inputId}
          ref={inputRef}
          value={input}
          maxLength={6000}
          rows={1}
          placeholder={placeholder}
          disabled={disableInput}
          aria-label="Mensagem"
          onChange={(event) => onInput(event.target.value)}
          onPaste={(event) => {
            const items = [...(event.clipboardData?.items || [])]
              .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter(Boolean);
            const images = items.length
              ? items
              : [...(event.clipboardData?.files || [])].filter((file) =>
                  file.type.startsWith('image/'),
                );
            if (!images.length) return;
            event.preventDefault();
            void attachments.paste(
              images,
              isWriter
                ? 'Imagens podem ser coladas nas conversas comuns.'
                : !canSend
                  ? 'Aguarde o chat ficar disponível para anexar.'
                  : '',
            );
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void onSend();
            }
          }}
        />
        <div className="composer-actions">
          <button
            id={idPrefix + 'microphone'}
            hidden={
              !!input.trim() || attachments.files.length > 0 || state.busy || writerState.busy
            }
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
            id={idPrefix + 'cancel-response'}
            aria-label="Cancelar resposta"
            hidden={!cancelable || (!state.busy && !writerState.busy)}
            onClick={onCancel}
          >
            ■
          </button>
          <button
            id={idPrefix + 'send'}
            hidden={(!input.trim() && !attachments.files.length) || state.busy || writerState.busy}
            className="send-button"
            aria-label="Enviar mensagem"
            disabled={!canSend}
            onClick={() => void onSend()}
          >
            <Icon name="arrow-up" />
          </button>
        </div>
      </div>
      {isWriter && writerState.selectedIds.length > 0 && (
        <button id="writer-selection" onClick={onClearSelection}>
          Trecho selecionado · limpar ×
        </button>
      )}
      <div className="composer-caption">
        <span id={idPrefix + 'status'} role="status">
          {attachments.error || status}
        </span>
        <span>Enter para enviar · Shift+Enter para nova linha</span>
      </div>
      <p className="attachment-caption" hidden={isWriter}>
        {attachmentCaption}
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

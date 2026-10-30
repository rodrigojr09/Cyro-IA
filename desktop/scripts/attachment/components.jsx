import React, { useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
export function AttachmentCard({
  file,
  onRemove,
  onSave,
  onUse,
  previewSource,
  imageId,
  removeId,
  heading,
  privacy,
  busy = false,
  suggestion = false,
  text,
}) {
  const [error, setError] = useState(''),
    [working, setWorking] = useState(false);
  const image = previewSource === undefined ? file.preview : previewSource;
  async function activate() {
    if (working || busy) return;
    setWorking(true);
    setError('');
    try {
      const result = onUse
        ? await onUse()
        : onSave
          ? await onSave()
          : await window.jarvisWindow.saveAttachment(file.id);
      if (result && !result.ok && !result.canceled)
        throw Error(result.data?.detail || 'Falha ao salvar anexo');
    } catch (error) {
      setError(error.message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div
      className={
        'attachment-card' +
        (suggestion ? ' attachment-suggestion' : '') +
        (text !== undefined ? ' attachment-text-suggestion' : '')
      }
      aria-busy={working || busy}
    >
      <div className="attachment-main">
        <button
          type="button"
          id={suggestion ? 'clipboard-use' : undefined}
          className="attachment-open"
          disabled={working || busy}
          onClick={() => void activate()}
          aria-label={(suggestion ? 'Usar ' : 'Baixar ') + file.name}
          title={
            suggestion
              ? 'Clique para usar no rascunho. Nada é enviado automaticamente.'
              : 'Baixar ' + file.name
          }
        >
          {text === undefined && (
            <span className="attachment-thumbnail">
              {image ? (
                <img id={imageId} src={image} alt="" />
              ) : (
                <Icon name={file.kind === 'image' ? 'image' : 'text'} />
              )}
            </span>
          )}
          <span className="attachment-info">
            <strong>{heading || file.name}</strong>
            {text !== undefined ? (
              <span className="attachment-suggested-text">{text}</span>
            ) : (
              <small>
                {file.type ||
                  {
                    image: 'Imagem',
                    document: 'Documento',
                    text: 'Texto',
                    code: 'Código',
                    link: 'Link',
                  }[file.kind] ||
                  file.kind}{' '}
                · {Math.ceil((file.size || 0) / 1024)} KB
              </small>
            )}
          </span>
          <Icon name={suggestion ? 'plus' : 'save'} />
        </button>
        {onRemove && (
          <button
            id={removeId}
            className="attachment-remove"
            type="button"
            aria-label={'Remover ' + file.name}
            disabled={working || busy}
            onClick={onRemove}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {privacy && (
        <p className="attachment-privacy">
          <Icon name="shield" />
          <span>{privacy}</span>
        </p>
      )}
      <span className="attachment-feedback" role="status">
        {error}
      </span>
    </div>
  );
}
export function AttachmentList({ files = [], unavailable = false, onRemove }) {
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <AttachmentCard
          key={file.id}
          file={file}
          onRemove={onRemove ? () => onRemove(file.id) : undefined}
          privacy={
            file.clipboard
              ? 'Prévia local. Imagens podem conter dados sensíveis. Só serão enviadas à IA ao enviar a mensagem.'
              : undefined
          }
        />
      ))}
      {unavailable && (
        <p className="attachment-unavailable">Salvo localmente em outro Computador</p>
      )}
    </div>
  );
}
export function useAttachments() {
  const [files, setFiles] = useState([]),
    [choosing, setChoosing] = useState(false),
    [error, setError] = useState(''),
    epoch = useRef(0),
    selecting = useRef(false),
    filesRef = useRef(files);
  filesRef.current = files;
  const discard = (id) => void window.jarvisWindow.discardAttachment(id).catch(() => {});
  return {
    files,
    choosing,
    error,
    clear() {
      epoch.current++;
      filesRef.current.forEach((file) => discard(file.id));
      filesRef.current = [];
      setFiles([]);
      setError('');
    },
    remove(id) {
      const next = filesRef.current.filter((file) => file.id !== id);
      filesRef.current = next;
      setFiles(next);
      discard(id);
    },
    async paste(images, unavailable = '', source = 'clipboard') {
      if (unavailable) {
        setError(unavailable);
        return;
      }
      if (selecting.current) {
        setError('Aguarde a seleção de anexos terminar.');
        return;
      }
      if (!images.length) return;
      if (images.length + filesRef.current.length > 5) {
        setError('Limite de 5 arquivos por mensagem.');
        return;
      }
      if (
        images.some(
          (file) =>
            (source !== 'drop' &&
              !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) ||
            !Number.isFinite(file.size) ||
            file.size <= 0 ||
            file.size > 5242880,
        )
      ) {
        setError(
          source === 'drop'
            ? 'Use arquivos compatíveis de até 5 MB.'
            : 'Use imagens PNG, JPEG, WebP ou GIF estático de até 5 MB.',
        );
        return;
      }
      selecting.current = true;
      setChoosing(true);
      setError('');
      const generation = epoch.current,
        created = [];
      try {
        for (const file of images) {
          const data = await new Promise((resolve, reject) => {
            const reader = new window.FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(Error('Não foi possível ler a imagem colada.'));
            reader.readAsDataURL(file);
          });
          if (generation !== epoch.current) break;
          const result =
            source === 'drop'
              ? await window.jarvisWindow.dropFile({ data, name: file.name })
              : await window.jarvisWindow.pasteImage({ data, type: file.type });
          if (!result?.ok || !Array.isArray(result.data?.files))
            throw Error(result?.data?.detail || 'Não foi possível colar a imagem.');
          created.push(
            ...result.data.files.map((item) => ({ ...item, clipboard: source === 'clipboard' })),
          );
        }
        if (generation !== epoch.current) {
          created.forEach((file) => discard(file.id));
          return;
        }
        const next = [...filesRef.current, ...created];
        filesRef.current = next;
        setFiles(next);
        return true;
      } catch (error) {
        created.forEach((file) => discard(file.id));
        setError(error.message);
      } finally {
        selecting.current = false;
        setChoosing(false);
      }
    },
    async choose() {
      if (selecting.current || files.length >= 5) return;
      selecting.current = true;
      setChoosing(true);
      setError('');
      const generation = epoch.current;
      try {
        const result = await window.jarvisWindow.chooseAttachments(5 - files.length);
        if (result.canceled) return;
        if (!result.ok) throw Error(result.data?.detail || 'Não foi possível anexar.');
        const selected = result.data.files;
        if (!Array.isArray(selected))
          throw Error('Não foi possível conferir os anexos selecionados.');
        if (generation !== epoch.current) {
          selected.forEach((file) => discard(file.id));
          return;
        }
        if (
          selected.some((file) => !Number.isFinite(file.size) || file.size > 5242880) ||
          files.length + selected.length > 5
        )
          throw Error('Limite de 5 arquivos de até 5 MB.');
        const next = [...filesRef.current, ...selected];
        filesRef.current = next;
        setFiles(next);
      } catch (error) {
        setError(error.message);
      } finally {
        selecting.current = false;
        setChoosing(false);
      }
    },
  };
}

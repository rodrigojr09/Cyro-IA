import React, { useRef, useState } from 'react';
export function AttachmentCard({ file, onRemove }) {
  const [preview, setPreview] = useState(null),
    [error, setError] = useState('');
  return (
    <div className="attachment-card">
      <strong>{file.name}</strong>
      <small>
        {file.type || file.kind} · {Math.ceil(file.size / 1024)} KB
      </small>
      <button
        type="button"
        onClick={async () => {
          try {
            const result = await window.jarvisWindow.saveAttachment(file.id);
            if (result && !result.ok && !result.canceled)
              throw Error(result.data?.detail || 'Falha ao salvar anexo');
          } catch (error) {
            setError(error.message);
          }
        }}
      >
        Salvar cópia
      </button>
      {(file.kind === 'image' || file.type?.startsWith('image')) && (
        <button
          onClick={async () => {
            try {
              const result = await window.jarvisWindow.attachmentInfo(file.id);
              if (!result.ok) throw Error(result.data?.detail);
              setPreview(result.data.preview);
            } catch (error) {
              setError(error.message);
            }
          }}
        >
          Ver prévia
        </button>
      )}
      {onRemove && (
        <button aria-label={'Remover ' + file.name} onClick={onRemove}>
          ×
        </button>
      )}
      {preview && <img src={preview} alt={'Prévia de ' + file.name} />}
      <span role="status">{error}</span>
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
      setFiles((previous) => previous.filter((file) => file.id !== id));
      discard(id);
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
        setFiles((previous) => [...previous, ...selected]);
      } catch (error) {
        setError(error.message);
      } finally {
        selecting.current = false;
        setChoosing(false);
      }
    },
  };
}

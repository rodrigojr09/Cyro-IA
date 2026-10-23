const path = require('node:path');
const fs = require('node:fs/promises');
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'txt',
  'md',
  'csv',
  'tsv',
  'json',
  'xml',
  'yaml',
  'yml',
  'rst',
  'tex',
  'html',
  'css',
  'js',
  'ts',
  'py',
  'sql',
];
function createAttachments({ dialog, window, backend }) {
  return {
    async choose(remaining = 5) {
      if (!Number.isInteger(remaining) || remaining < 1 || remaining > 5)
        throw Error('Limite de anexos inválido.');
      const selected = await dialog.showOpenDialog(window(), {
        title: 'Anexar até 5 arquivos · máximo de 5 MB cada',
        buttonLabel: 'Anexar',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Imagens e documentos', extensions: EXTENSIONS }],
      });
      if (selected.canceled) return { canceled: true };
      if (!selected.filePaths.length || selected.filePaths.length > remaining)
        throw Error('É permitido anexar no máximo 5 arquivos por mensagem.');
      for (const file of selected.filePaths) {
        const info = await fs.lstat(file);
        if (!info.isFile() || info.isSymbolicLink())
          throw Error('Selecione um arquivo local regular.');
        if (info.size > MAX_BYTES) throw Error('Cada anexo pode ter no máximo 5 MB.');
      }
      return backend(
        '/desktop/attachments/import',
        'POST',
        JSON.stringify({ paths: selected.filePaths }),
      );
    },
    async info(id) {
      if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) throw Error('Anexo inválido.');
      return backend('/desktop/attachments/info', 'POST', JSON.stringify({ id }));
    },
    async discard(id) {
      if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) throw Error('Anexo inválido.');
      return backend('/desktop/attachments/discard', 'POST', JSON.stringify({ id }));
    },
    async save(id) {
      const meta = await this.info(id);
      if (!meta.ok) return meta;
      const selected = await dialog.showSaveDialog(window(), {
        title: 'Salvar cópia do anexo local',
        defaultPath: path.basename(meta.data.name),
        buttonLabel: 'Salvar cópia',
      });
      if (selected.canceled || !selected.filePath) return { canceled: true };
      return backend(
        '/desktop/attachments/export',
        'POST',
        JSON.stringify({ id, path: selected.filePath }),
      );
    },
  };
}
module.exports = { createAttachments, MAX_BYTES };

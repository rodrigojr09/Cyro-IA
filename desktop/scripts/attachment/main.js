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
    async pasteImage(value) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !['data', 'type'].includes(key)) ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.type) ||
        typeof value.data !== 'string' ||
        value.data.length > Math.ceil(MAX_BYTES / 3) * 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
      )
        throw Error('Imagem colada inválida ou acima de 5 MB.');
      const raw = Buffer.from(value.data, 'base64');
      if (!raw.length || raw.length > MAX_BYTES || raw.toString('base64') !== value.data)
        throw Error('Imagem colada inválida ou acima de 5 MB.');
      return backend(
        '/desktop/attachments/paste-image',
        'POST',
        JSON.stringify({ data: value.data }),
      );
    },
    async dropFile(value) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !['name', 'data'].includes(key)) ||
        typeof value.name !== 'string' ||
        !value.name ||
        value.name.length > 200 ||
        /[\\/:\x00-\x1f]/.test(value.name) ||
        !EXTENSIONS.includes(path.extname(value.name).slice(1).toLowerCase()) ||
        typeof value.data !== 'string' ||
        value.data.length > Math.ceil(MAX_BYTES / 3) * 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
      )
        throw Error('Anexo inválido ou acima de 5 MB.');
      const raw = Buffer.from(value.data, 'base64');
      if (!raw.length || raw.length > MAX_BYTES || raw.toString('base64') !== value.data)
        throw Error('Anexo inválido ou acima de 5 MB.');
      return backend(
        '/desktop/attachments/import-data',
        'POST',
        JSON.stringify({ name: value.name, data: value.data }),
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

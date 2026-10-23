const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const actions = new Set([
  'open',
  'get',
  'proposal',
  'revision',
  'create',
  'save',
  'settings',
  'history',
  'restore',
  'undo',
  'redo',
  'structure',
  'decide',
  'messages',
  'prune',
  'assist',
]);
function install({ ipcMain, dialog, trusted, mainWindow, backend }) {
  let dirty = false;
  function validate(event, value) {
    if (
      !trusted(event) ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !/^[0-9a-f-]{36}$/i.test(value.project_id || '') ||
      Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024
    )
      throw Error('Solicitação Writer não autorizada ou acima do limite.');
  }
  ipcMain.handle('writer:command', async (event, value) => {
    validate(event, value);
    if (
      !actions.has(value.action) ||
      Object.keys(value).some((k) => !['project_id', 'action', 'payload'].includes(k))
    )
      throw Error('Operação Writer inválida.');
    return backend('/writer', 'POST', JSON.stringify(value));
  });
  ipcMain.handle('writer:cancel', (event, project_id) => {
    validate(event, { project_id });
    return backend('/writer/cancel', 'POST', JSON.stringify({ project_id }));
  });
  ipcMain.handle('writer:dirty', (event, value) => {
    if (!trusted(event) || typeof value !== 'boolean') throw Error('Solicitação não autorizada.');
    dirty = value;
  });
  ipcMain.handle('writer:export', async (event, value) => {
    validate(event, value);
    if (
      !['docx', 'md', 'txt'].includes(value.format) ||
      !Array.isArray(value.document_ids) ||
      value.document_ids.length > 200 ||
      Object.keys(value).some((k) => !['project_id', 'document_ids', 'format'].includes(k))
    )
      throw Error('Exportação inválida.');
    const result = await backend('/writer/export', 'POST', JSON.stringify(value));
    if (!result.ok) throw Error(result.data?.detail || 'Não foi possível exportar.');
    const data = result.data;
    if (
      data.format !== value.format ||
      typeof data.base64 !== 'string' ||
      data.base64.length > 21 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64)
    )
      throw Error('Exportação inválida.');
    const choice = await dialog.showSaveDialog(mainWindow(), {
      title: 'Exportar documento Writer',
      defaultPath: path.basename(data.name).replace(/[<>:"/\\|?*]/g, '_'),
      filters: [{ name: value.format.toUpperCase(), extensions: [value.format] }],
    });
    if (choice.canceled || !choice.filePath) return { saved: false };
    let target = path.resolve(choice.filePath);
    if (path.extname(target).toLowerCase() !== '.' + value.format) target += '.' + value.format;
    if (target.split(path.sep).some((part) => part.toLowerCase() === 'backup'))
      throw Error('Backup é somente leitura. Escolha outro destino.');
    const parent = path.dirname(target);
    if ((await fs.realpath(parent)).toLowerCase() !== parent.toLowerCase())
      throw Error('Destino redirecionado.');
    try {
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || stat.nlink > 1)
        throw Error('Destino compartilhado ou redirecionado.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const temporary = path.join(parent, '.jarvis-writer-' + randomUUID() + '.tmp');
    try {
      await fs.writeFile(temporary, Buffer.from(data.base64, 'base64'), {
        flag: 'wx',
        mode: 0o600,
      });
      await fs.rename(temporary, target);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    return { saved: true, name: path.basename(target) };
  });
  return { isDirty: () => dirty };
}
module.exports = { install };

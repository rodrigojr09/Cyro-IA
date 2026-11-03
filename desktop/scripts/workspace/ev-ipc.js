const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const MAX = 8 * 1024 * 1024;
const MIME = {
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};
function installEVIPC({ electron, service, dataDir, fetcher = fetch }) {
  const { ipcMain, BrowserWindow, dialog } = electron;
  const page = pathToFileURL(path.resolve(__dirname, '../../index.html')).href;
  let draftCredential,
    scopes = new Map();
  function session(event) {
    const win = BrowserWindow.fromWebContents(event.sender),
      current = service()?.current();
    if (
      !win ||
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame.url !== page ||
      !current ||
      process.env.JARVIS_AUTHENTICATED !== '1'
    )
      throw Error('Entre na janela principal do Cyro para acessar seus espaços.');
    if (draftCredential !== current.credential) {
      draftCredential = current.credential;
      scopes = new Map();
    }
    const check = () => {
      if (
        service()?.current()?.credential !== current.credential ||
        process.env.JARVIS_AUTHENTICATED !== '1'
      )
        throw Error('A sessão mudou. Entre novamente.');
    };
    return { win, current, check };
  }
  const id = (value) => {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    )
      throw Error('Identificador inválido.');
    return value;
  };
  ipcMain.handle('ev:request', async (event, input) => {
    const s = session(event);
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      JSON.stringify(input).length > 1048576
    )
      throw Error('Operação inválida.');
    try {
      const result =
        input.action === 'catalog'
          ? await service().request('/api/ev')
          : await service().request(
              input.action?.startsWith('assistant.')
                ? '/api/ev/assistant'
                : input.action === 'chat.send'
                  ? '/api/ev/chat'
                  : '/api/ev',
              'POST',
              input,
            );
      s.check();
      if (
        (input.action === 'open' || input.action?.startsWith('assistant.')) &&
        result.space &&
        result.ownerId
      )
        scopes.set(result.space.id, result.ownerId);
      return result;
    } catch (error) {
      s.check();
      return {
        error: error.ev
          ? error.message
          : 'Não foi possível acessar seus espaços. Confira a conexão e tente novamente.',
        status: error.status || 0,
      };
    }
  });
  ipcMain.handle('ev:dirty', (event, value) => {
    const s = session(event);
    s.win.cyroEVDirty = value === true;
  });
  const draftQueues = new Map();
  const draftAction = async (event, input) => {
    const s = session(event);
    id(input?.projectId);
    const owner = scopes.get(input.projectId);
    if (!owner || !dataDir || !electron.safeStorage.isEncryptionAvailable())
      throw Error('Abra o espaço para recuperar seu rascunho protegido.');
    const hash = require('node:crypto')
      .createHash('sha256')
      .update(s.current.origin + ':' + owner + ':' + input.projectId)
      .digest('hex');
    if (input.channel !== undefined && input.channel !== 'CHAT')
      throw Error('Canal de rascunho inválido.');
    const folder = path.join(dataDir, 'ev-drafts'),
      file = path.join(folder, hash + (input.channel === 'CHAT' ? '.chat' : '') + '.bin');
    if (input.operation === 'read') {
      try {
        const raw = await fs.readFile(file);
        s.check();
        return JSON.parse(electron.safeStorage.decryptString(raw));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw Error('Não foi possível recuperar o rascunho.');
      }
    }
    if (input.operation === 'remove') {
      await fs.rm(file, { force: true });
      s.check();
      s.win.cyroEVDirty = false;
      return { ok: true };
    }
    if (input.operation !== 'write' || JSON.stringify(input.content).length > 524288)
      throw Error('Rascunho inválido ou acima do limite.');
    s.win.cyroEVDirty = true;
    await fs.mkdir(folder, { recursive: true });
    s.check();
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(
        temporary,
        electron.safeStorage.encryptString(JSON.stringify(input.content)),
        { flag: 'wx', mode: 0o600 },
      );
      s.check();
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    s.check();
    s.win.cyroEVDirty = true;
    return { ok: true };
  };
  ipcMain.handle('ev:draft', (event, input) => {
    // A delayed write may never recreate a draft after an acknowledged removal.
    const key = id(input?.projectId),
      previous = draftQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => draftAction(event, input));
    draftQueues.set(key, next);
    void next
      .finally(() => {
        if (draftQueues.get(key) === next) draftQueues.delete(key);
      })
      .catch(() => {});
    return next;
  });
  ipcMain.handle('ev:upload', async (event, projectId) => {
    const s = session(event);
    id(projectId);
    const chosen = await dialog.showOpenDialog(s.win, {
      title: 'Enviar arquivos ao Espaço Virtual',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documentos e planilhas', extensions: ['xml', 'csv', 'xlsx', 'pdf', 'txt'] },
      ],
    });
    s.check();
    if (chosen.canceled) return { canceled: true };
    if (chosen.filePaths.length > 50) throw Error('Selecione até 50 arquivos por envio.');
    const files = [],
      failures = [];
    for (const file of chosen.filePaths) {
      s.check();
      const name = path.basename(file);
      try {
        const stat = await fs.stat(file),
          mime = MIME[path.extname(file).toLowerCase()];
        if (!stat.isFile() || !mime || stat.size <= 0 || stat.size > MAX)
          throw Error('Formato inválido, arquivo vazio ou maior que 8 MB.');
        const handle = await fs.open(file, 'r'),
          buffer = Buffer.alloc(MAX + 1);
        let length = 0;
        try {
          while (length <= MAX) {
            const item = await handle.read(buffer, length, buffer.length - length, null);
            if (!item.bytesRead) break;
            length += item.bytesRead;
          }
        } finally {
          await handle.close();
        }
        s.check();
        if (length > MAX || length !== stat.size)
          throw Error('Arquivo alterado durante a leitura ou maior que 8 MB.');
        const content = buffer.subarray(0, length);
        const query = new URLSearchParams({ projectId, name, operationId: randomUUID() });
        const response = await fetcher(s.current.origin + '/api/ev/files?' + query, {
          method: 'POST',
          redirect: 'error',
          headers: { Authorization: 'Bearer ' + s.current.credential, 'Content-Type': mime },
          body: content,
          signal: AbortSignal.timeout(120000),
        });
        s.check();
        const result = await response.json();
        s.check();
        if (!response.ok)
          throw Error(typeof result.error === 'string' ? result.error : 'Falha no envio.');
        files.push(result.file);
      } catch (error) {
        s.check();
        failures.push({ name, error: String(error.message).slice(0, 300) });
      }
    }
    return { files, failures };
  });
  ipcMain.handle('ev:download', async (event, input) => {
    const s = session(event);
    id(input?.projectId);
    id(input?.fileId);
    // Names and paths are chosen natively; the renderer never supplies a target path.
    const metadata = await service().request('/api/ev', 'POST', {
      action: 'file.get',
      projectId: input.projectId,
      id: input.fileId,
    });
    s.check();
    const target = await dialog.showSaveDialog(s.win, {
      title: 'Salvar cópia',
      defaultPath: path.basename(metadata.file.name),
    });
    s.check();
    if (target.canceled || !target.filePath) return { canceled: true };
    const q = new URLSearchParams({ projectId: input.projectId, fileId: input.fileId });
    const response = await fetcher(s.current.origin + '/api/ev/files?' + q, {
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + s.current.credential },
      signal: AbortSignal.timeout(120000),
    });
    s.check();
    if (!response.ok || !response.body) throw Error('Arquivo indisponível.');
    const reader = response.body.getReader(),
      chunks = [];
    let length = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.length;
        if (length > MAX) {
          await reader.cancel();
          throw Error('Arquivo acima do limite.');
        }
        chunks.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
    const content = Buffer.concat(chunks);
    if (
      content.length !== metadata.file.size ||
      require('node:crypto').createHash('sha256').update(content).digest('hex') !==
        metadata.file.sha256
    )
      throw Error('Não foi possível verificar a integridade do arquivo.');
    s.check();
    await fs.writeFile(target.filePath, content);
    return { ok: true };
  });
}
module.exports = { installEVIPC };

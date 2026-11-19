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
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/plain',
  '.py': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
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
              [
                'memory.list',
                'memory.message',
                'memory.confirm',
                'memory.settings.get',
                'memory.settings',
                'memory.put',
                'memory.correct',
                'memory.forget',
                'memory.history',
                'memory.rebuild',
                'memory.migrate',
              ].includes(input.action)
                ? '/api/memory'
                : input.action?.startsWith('assistant.')
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
  const executions = new Set();
  ipcMain.handle('ev:execute', async (event, input) => {
    const s = session(event);
    const projectId = id(input?.projectId);
    const requestId = id(input?.requestId);
    if (executions.size) throw Error('Aguarde a execução atual terminar.');
    executions.add(requestId);
    s.win.cyroEVExecuting = true;
    try {
      // Reauthorize on the central API; renderer cannot inject a command or files.
      const state = await service().request('/api/ev', 'POST', {
        action: 'workbench.list',
        projectId,
      });
      s.check();
      const request = state.executions?.find((item) => item.id === requestId);
      if (!request) throw Error('Solicitação de execução indisponível. Atualize a IDE.');
      const approval = await dialog.showMessageBox(s.win, {
        type: 'warning',
        title: 'Executar código do EV',
        message: 'Autorizar esta execução isolada?',
        detail: `Runtime: ${request.runtime}\nSem rede · 128 MB · 15 segundos\nArquivos: ${request.files.map((f) => f.name).join(', ') || 'nenhum'}\n\n${request.source}`,
        buttons: ['Cancelar', 'Executar no contêiner'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      s.check();
      if (approval.response !== 1) return { cancelled: true };
      const result = await require('./workbench-runner').runIsolated(request, { check: s.check });
      try {
        await service().request('/api/ev', 'POST', {
          action: 'workbench.result',
          projectId,
          operationId: randomUUID(),
          requestId,
          output: result.output.slice(0, 16000),
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          outputLimited: result.outputLimited,
        });
      } catch {
        result.persistenceError = 'A saída não foi salva no EV. Copie o resultado antes de fechar.';
      }
      s.check();
      return result;
    } finally {
      executions.delete(requestId);
      s.win.cyroEVExecuting = executions.size > 0;
    }
  });
  ipcMain.handle('ev:export-source', async (event, input) => {
    const s = session(event),
      projectId = id(input?.projectId);
    const state = await service().request('/api/ev', 'POST', {
      action: 'workbench.list',
      projectId,
    });
    s.check();
    const file = state.files?.find((f) => f.name === input.name);
    if (!file) throw Error('Arquivo da IDE indisponível.');
    const result = await dialog.showSaveDialog(s.win, {
      title: 'Salvar arquivo da IDE',
      defaultPath: path.basename(file.name),
    });
    s.check();
    if (result.canceled || !result.filePath) return { cancelled: true };
    await fs.writeFile(result.filePath, file.content, { mode: 0o600 });
    s.check();
    return { ok: true };
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
    if (input.channel !== undefined && !['CHAT', 'IDE'].includes(input.channel))
      throw Error('Canal de rascunho inválido.');
    const folder = path.join(dataDir, 'ev-drafts'),
      file = path.join(
        folder,
        hash +
          (input.channel === 'CHAT' ? '.chat' : input.channel === 'IDE' ? '.ide' : '') +
          '.bin',
      );
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
      s.win[input.channel === 'IDE' ? 'cyroEVWorkbenchDirty' : 'cyroEVDirty'] = false;
      return { ok: true };
    }
    if (input.operation !== 'write' || JSON.stringify(input.content).length > 524288)
      throw Error('Rascunho inválido ou acima do limite.');
    s.win[input.channel === 'IDE' ? 'cyroEVWorkbenchDirty' : 'cyroEVDirty'] = true;
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
    s.win[input.channel === 'IDE' ? 'cyroEVWorkbenchDirty' : 'cyroEVDirty'] = true;
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
      filters: [{ name: 'Todos os arquivos', extensions: ['*'] }],
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
          mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX)
          throw Error('Arquivo vazio ou maior que 8 MB.');
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
  ipcMain.handle('ev:read-source', async (event, input) => {
    const s = session(event),
      projectId = id(input?.projectId),
      fileId = id(input?.fileId);
    const metadata = await service().request('/api/ev', 'POST', {
      action: 'file.get',
      projectId,
      id: fileId,
    });
    s.check();
    if (metadata.file.size > 64000)
      throw Error('O editor aceita arquivos de texto de até 64 KB. O original foi preservado.');
    const response = await fetcher(
      s.current.origin + '/api/ev/files?' + new URLSearchParams({ projectId, fileId }),
      {
        redirect: 'error',
        headers: { Authorization: 'Bearer ' + s.current.credential },
        signal: AbortSignal.timeout(30000),
      },
    );
    s.check();
    if (!response.ok || !response.body) throw Error('Arquivo indisponível.');
    const reader = response.body.getReader(),
      chunks = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > 64000) {
          await reader.cancel();
          throw Error('Arquivo acima do limite do editor.');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const content = Buffer.concat(chunks);
    s.check();
    if (
      content.length !== metadata.file.size ||
      require('node:crypto').createHash('sha256').update(content).digest('hex') !==
        metadata.file.sha256
    )
      throw Error('Integridade do arquivo não confirmada.');
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
      throw Error('Este formato não é texto UTF-8. Baixe o original para abri-lo.');
    }
    if (text.includes('\0'))
      throw Error('O arquivo contém dados binários. O original continua preservado.');
    return { name: metadata.file.name, content: text };
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

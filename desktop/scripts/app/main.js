const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, screen } = require('electron');
const portablePaths = require('./portable-paths');
const dataDir = portablePaths.resolveData({
  packaged: !!app.isPackaged,
  executable: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
  override: process.env.JARVIS_DATA_DIR,
  localAppData: process.env.LOCALAPPDATA,
  home: require('os').homedir(),
});
if (app.isPackaged && process.env.JARVIS_CLOUD !== '1') {
  if (
    ['.restore-transaction.json', '.migration-transaction.json'].some((name) =>
      require('node:fs').existsSync(
        require('node:path').join(require('node:path').dirname(dataDir), name),
      ),
    )
  ) {
    const recovery = require('node:child_process').spawnSync(
      require('node:path').join(process.resourcesPath, 'backend', 'jarvis-backend.exe'),
      ['--recover-data'],
      {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        timeout: 30000,
        env: { ...process.env, JARVIS_DATA_DIR: dataDir },
      },
    );
    if (recovery.status !== 0)
      throw Error('Não foi possível recuperar a restauração interrompida. Preserve o dispositivo.');
  }
  portablePaths.configureElectron(app, dataDir);
}
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance || (process.argv || []).includes('--jarvis-probe')) {
  app.exit(ownsInstance ? 0 : 73);
} else {
  app.disableHardwareAcceleration();
  const path = require('path');
  const fs = require('fs/promises');
  const { pathToFileURL } = require('url');
  const pageURL = pathToFileURL(path.join(DESKTOP_ROOT, 'index.html')).href;
  if (!path.isAbsolute(dataDir)) throw new Error('JARVIS_DATA_DIR deve ser um caminho absoluto.');
  const routes = new Map([
    ['/projects/selection/size', 'POST'],
    ['/health', 'GET'],
    ['/history', 'GET'],
    ['/chat', 'POST'],
    ['/speak', 'POST'],
    ['/action/open', 'POST'],
    ['/action/folder', 'POST'],
    ['/action/confirm', 'POST'],
    ['/computer/processes', 'GET'],
    ['/computer/system', 'GET'],
    ['/programming/status', 'GET'],
    ['/programming/revoke', 'POST'],
    ['/workspace', 'GET'],
    ['/workspace/bootstrap', 'GET'],
    ['/workspace/progress', 'GET'],
    ['/storage', 'GET'],
    ['/projects/settings', 'POST'],
    ['/chats/settings', 'POST'],
    ['/workspace/view', 'POST'],
    ['/chats/history', 'GET'],
    ['/chats/create', 'POST'],
    ['/projects/refresh', 'POST'],
    ['/projects/accept-partial', 'POST'],
    ['/projects/knowledge', 'GET'],
    ['/projects/note', 'POST'],
    ['/projects/selection', 'GET'],
    ['/projects/selection/save', 'POST'],
  ]);
  let win,
    quickController,
    clipboardManager,
    writerController,
    quitting = false,
    packagedBackend,
    openBackupsOnExit = false,
    backendStopped = false,
    stateStorage = null;
  let updatePending = true;
  ipcMain.on('cyro:updates-pending', (event, value) => {
    if (trusted(event) && typeof value === 'boolean') updatePending = value;
  });
  app.on('cyro:install-update', async (file, done) => {
    if (
      !win ||
      updatePending ||
      writerController?.isDirty() ||
      (quickController && !quickController.safeToUpdate())
    ) {
      done(false);
      return;
    }
    const answer = await dialog.showMessageBox(win, {
      type: 'question',
      message: 'Instalar a atualização do Cyro?',
      detail:
        'O Cyro será encerrado com segurança. O instalador Windows será aberto para concluir a atualização; os dados do usuário serão preservados.',
      buttons: ['Cancelar', 'Instalar e encerrar'],
      defaultId: 0,
      cancelId: 0,
    });
    if (
      answer.response !== 1 ||
      updatePending ||
      writerController?.isDirty() ||
      (quickController && !quickController.safeToUpdate())
    ) {
      done(false);
      return;
    }
    app.once('will-quit', () => {
      const child = require('node:child_process').spawn(file, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      });
      child.on('error', () =>
        dialog.showErrorBox(
          'Cyro IA',
          'Não foi possível iniciar o instalador. Abra o Cyro e use Link para Baixar.',
        ),
      );
      child.unref();
    });
    done(true);
    quitJarvis();
  });
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  function trusted(event) {
    return (
      event.sender === win?.webContents &&
      event.senderFrame === win.webContents.mainFrame &&
      (process.env.JARVIS_CLOUD !== '1' || process.env.JARVIS_AUTHENTICATED === '1') &&
      event.senderFrame.url === pageURL
    );
  }
  function notifyWorkspaceChanged() {
    try {
      if (win && !win.isDestroyed()) win.webContents.send('jarvis:workspace-changed');
    } catch {
      // Closing a renderer must never turn a committed operation into a retry.
    }
  }
  function mutatesWorkspace(route, method) {
    return (
      method === 'POST' &&
      [
        '/chat',
        '/quick/chat',
        '/chats/change',
        '/chats/create',
        '/chats/settings',
        '/projects/register',
        '/projects/remove',
        '/projects/settings',
      ].includes(route)
    );
  }
  const readiness = require('../session/readiness').createReadiness({
    authenticated: process.env.JARVIS_CLOUD !== '1' || process.env.JARVIS_AUTHENTICATED === '1',
    changed: () => quickController?.refreshReady?.(),
  });
  async function backend(route, method, body) {
    if (
      process.env.JARVIS_CLOUD === '1' &&
      ['/quick/chat', '/chat'].includes(route) &&
      !readiness.ready()
    )
      throw Error('Aguarde o carregamento das suas informações e histórico.');
    if (process.env.JARVIS_CLOUD === '1' && process.env.JARVIS_AUTHENTICATED !== '1')
      throw Error('Entre com sua conta.');
    const sessionGeneration = readiness.capture();
    const bootstrapToken = route === '/workspace/bootstrap' ? readiness.begin() : null;
    try {
      const token = (await fs.readFile(path.join(dataDir, '.local-token'), 'utf8')).trim();
      const response = await fetch('http://127.0.0.1:8765' + route, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': token },
        body: method === 'POST' ? body : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(180000),
      });
      const result = { ok: response.ok, data: await response.json() };
      if (!readiness.current(sessionGeneration)) throw Error('A sessão mudou. Entre novamente.');
      if (bootstrapToken) readiness.finish(bootstrapToken, result.ok);
      if (result.ok && mutatesWorkspace(route, method)) notifyWorkspaceChanged();
      return result;
    } catch {
      throw new Error('Backend indisponível. Inicie ou reinicie o Python.');
    }
  }
  const attachments = require('../attachment/main').createAttachments({
    dialog,
    window: () => win,
    backend,
  });
  const windowState = require('./window-state');
  const activeStreams = new Map();
  ipcMain.handle('jarvis:workspace-ready', (event) => {
    if (!trusted(event)) throw Error('Solicitação não autorizada.');
    return readiness.acknowledge();
  });
  ipcMain.handle('jarvis:cancel-chat', (event) => {
    if (!trusted(event)) throw Error('Solicitação não autorizada.');
    activeStreams.get(event.sender.id)?.abort();
  });
  const stateFile = path.join(dataDir, 'window-state.json');
  function createWindow() {
    const saved = windowState.load(stateFile, screen?.getAllDisplays?.() || [], stateStorage);
    win = new BrowserWindow({
      width: 1280,
      height: 850,
      ...(saved?.bounds || {}),
      minWidth: 800,
      minHeight: 560,
      frame: true,
      autoHideMenuBar: true,
      alwaysOnTop: false,
      resizable: true,
      fullscreenable: true,
      backgroundColor: '#0D1117',
      icon: app.isPackaged
        ? path.join(process.resourcesPath, 'jarvis.png')
        : path.join(DESKTOP_ROOT, 'assets/cyro.png'),
      webPreferences: {
        ...(app.isPackaged && process.env.JARVIS_CLOUD !== '1'
          ? { partition: 'jarvis-private' }
          : {}),
        ...(app.isPackaged && process.env.JARVIS_CLOUD !== '1'
          ? { additionalArguments: ['--jarvis-encrypted-storage'] }
          : {}),
        preload: path.join(DESKTOP_ROOT, 'scripts/app/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.on?.('close', (event) => {
      windowState.save(stateFile, win, stateStorage);
      if (!quitting) {
        event.preventDefault();
        if (writerController?.isDirty()) {
          dialog
            .showMessageBox(win, {
              type: 'warning',
              message: 'Há alterações do Writer ainda não salvas.',
              detail: 'Aguarde a indicação Salvo. Sair agora pode perder a edição pendente.',
              buttons: ['Manter aberto', 'Sair sem salvar'],
              defaultId: 0,
              cancelId: 0,
            })
            .then((result) => {
              if (result.response === 1) quitJarvis();
            });
          return;
        }
        quitJarvis();
      }
    });
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F11' && !input.isAutoRepeat) {
        event.preventDefault();
        win.setFullScreen(!win.isFullScreen());
      }
    });
    if (!saved || saved.maximized) win.maximize?.();
    if (saved?.fullscreen) win.setFullScreen?.(true);
    win.loadFile(
      path.join(
        DESKTOP_ROOT,
        process.env.JARVIS_CLOUD === '1' && process.env.JARVIS_AUTHENTICATED !== '1'
          ? 'login.html'
          : 'index.html',
      ),
    );
  }
  function showMain(chatId) {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      if (chatId) win.webContents.send('jarvis:open-chat', chatId);
    }
  }
  function quitJarvis() {
    quitting = true;
    app.quit();
  }
  function initializeDesktop() {
    const initialSettings = require('../session/initial-settings').load(dataDir, stateStorage);
    const browserStateFile = path.join(dataDir, 'config/browser-state.json');
    const browserState = stateStorage?.readJSON(browserStateFile) || {};
    const allowedStorage = new Set([
      'jarvis.preferences',
      'jarvis.setup-applied',
      'jarvis.selection',
      'jarvis.quick.draft',
    ]);
    ipcMain.on('jarvis:storage', (event, key, value, write) => {
      const composer = quickController?.windows?.composer;
      const quickTrusted =
        composer &&
        event.sender === composer.webContents &&
        event.senderFrame === composer.webContents.mainFrame &&
        event.senderFrame.url ===
          pathToFileURL(path.join(DESKTOP_ROOT, 'quick.html')).href + '?panel=composer';
      if (
        (!trusted(event) && !(quickTrusted && key === 'jarvis.quick.draft')) ||
        !allowedStorage.has(key)
      ) {
        event.returnValue = null;
        return;
      }
      try {
        if (write) {
          if (value !== null && (typeof value !== 'string' || value.length > 12000))
            throw Error('Estado inválido.');
          if (value === null) delete browserState[key];
          else browserState[key] = value;
          if (stateStorage) stateStorage.writeJSON(browserStateFile, browserState);
        }
        event.returnValue = browserState[key] ?? null;
      } catch {
        event.returnValue = null;
      }
    });
    ipcMain.handle('jarvis:initial-settings', (event) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return initialSettings;
    });
    ipcMain.handle('jarvis:open-backups', async (event) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      if (process.env.JARVIS_CLOUD === '1')
        throw Error('Backups Cloud: encerre o Cyro e copie a pasta local de dados.');
      if (!app.isPackaged) throw Error('Use o módulo portable_backup no desenvolvimento.');
      const answer = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Backups do Cyro IA',
        message: 'Encerrar o Cyro e abrir o gerenciador de backups?',
        detail:
          'O backend será encerrado antes de copiar ou restaurar bancos. Aguarde o término antes de remover o dispositivo.',
        buttons: ['Cancelar', 'Encerrar e abrir backups'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer.response !== 1) return { canceled: true };
      openBackupsOnExit = '--backups';
      quitJarvis();
      return { ok: true };
    });
    for (const [channel, argument, label] of [
      ['jarvis:open-migration', '--migrate', 'migrar dados de uma versão anterior'],
      ['jarvis:open-startup', '--startup', 'configurar a inicialização neste computador'],
    ])
      ipcMain.handle(channel, async (event) => {
        if (process.env.JARVIS_CLOUD === '1')
          throw Error('Função da edição anterior; consulte a documentação de migração.');
        if (!trusted(event) || !app.isPackaged) throw Error('Disponível na edição portátil.');
        const answer = await dialog.showMessageBox(win, {
          type: 'question',
          title: 'Cyro IA',
          message: `Encerrar o Cyro para ${label}?`,
          buttons: ['Cancelar', 'Continuar'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (answer.response !== 1) return { canceled: true };
        openBackupsOnExit = argument;
        quitJarvis();
        return { ok: true };
      });
    ipcMain.handle('jarvis:open-ai-config', async (event) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      if (process.env.JARVIS_CLOUD === '1') {
        await dialog.showMessageBox(win, {
          message: 'A inteligência artificial é gerenciada pelo administrador.',
          detail:
            'Entre com o e-mail e a senha cadastrados pelo administrador. A chave OpenAI fica exclusivamente no Cloud.',
        });
        return { ok: true };
      }
      try {
        if (app.isPackaged) {
          await new Promise((resolve, reject) => {
            const child = require('node:child_process').spawn(
              path.join(process.resourcesPath, 'backend', 'jarvis-backend.exe'),
              ['--configure'],
              {
                shell: false,
                windowsHide: true,
                stdio: 'ignore',
                env: { ...process.env, JARVIS_DATA_DIR: dataDir },
              },
            );
            child.once('error', () => reject(Error('Configuração indisponível.')));
            child.once('exit', (code) =>
              code === 0 ? resolve() : reject(Error('Configuração cancelada.')),
            );
          });
          return { ok: true };
        }
        const file = await require('../session/ai-config').prepareConfig({
          packaged: !!app.isPackaged,
          dataDir,
          sourceDir: DESKTOP_ROOT,
        });
        shell.showItemInFolder(file);
        return { ok: true };
      } catch {
        throw Error(
          'Não foi possível abrir a configuração privada. Confira as permissões da pasta de dados.',
        );
      }
    });
    ipcMain.handle('jarvis:authorize-folder', async (event) => {
      if (!trusted(event)) throw new Error('Solicitação não autorizada.');
      const selected = await dialog.showOpenDialog(win, {
        title: 'Autorizar leitura de código nesta pasta — nenhum arquivo será alterado',
        buttonLabel: 'Selecionar pasta',
        properties: ['openDirectory'],
      });
      if (selected.canceled || selected.filePaths.length !== 1) return { canceled: true };
      const selectedPath = selected.filePaths[0];
      const confirmation = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Autorizar análise somente leitura',
        message: 'Permitir que o Cyro leia código nesta pasta e nas subpastas?',
        detail:
          selectedPath +
          '\nPrimeiro você escolherá os arquivos e pastas usados na análise, sem consumo de tokens. A OpenAI será usada somente após confirmar a seleção. A pasta original não será modificada.',
        buttons: ['Cancelar', 'Autorizar leitura'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return { canceled: true };
      return backend('/projects/register', 'POST', JSON.stringify({ path: selectedPath }));
    });
    ipcMain.handle('jarvis:attachments-choose', async (event, remaining) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return attachments.choose(remaining);
    });
    ipcMain.handle('jarvis:attachments-paste-image', async (event, value) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return attachments.pasteImage(value);
    });
    ipcMain.handle('jarvis:attachments-drop-file', async (event, value) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return attachments.dropFile(value);
    });
    ipcMain.handle('jarvis:attachments-info', async (event, id) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return attachments.info(id);
    });
    ipcMain.handle('jarvis:attachments-save', async (event, id) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return attachments.save(id);
    });
    ipcMain.handle('jarvis:attachments-discard', async (event, id) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return attachments.discard(id);
    });
    ipcMain.handle('jarvis:remove-project', async (event, projectId) => {
      if (!trusted(event) || !/^[a-f0-9-]{36}$/i.test(projectId))
        throw new Error('Projeto inválido.');
      const result = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Remover projeto do Cyro IA',
        message: 'A pasta original será preservada. O que deseja remover?',
        detail:
          'Manter memória permite recuperar os chats ao cadastrar a mesma pasta novamente. Apagar memória remove os chats e o conhecimento internos deste projeto.',
        buttons: ['Cancelar', 'Somente cadastro; manter memória', 'Cadastro e memória interna'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response === 0) return { canceled: true };
      return backend(
        '/projects/remove',
        'POST',
        JSON.stringify({
          project_id: projectId,
          delete_memory: result.response === 2,
          confirmed: true,
        }),
      );
    });
    ipcMain.handle('jarvis:manage-chat', async (event, chatId, action, title) => {
      if (
        !trusted(event) ||
        !/^[a-f0-9-]{36}$/i.test(chatId) ||
        !['rename', 'archive', 'restore', 'delete', 'clear'].includes(action)
      )
        throw new Error('Conversa inválida.');
      const body = { chat_id: chatId };
      if (action === 'rename') {
        if (typeof title !== 'string' || !title.trim() || title.length > 120)
          throw new Error('Título inválido.');
        body.title = title;
      } else if (action === 'restore') body.archived = false;
      else {
        const result = await dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Gerenciar conversa',
          message:
            action === 'clear'
              ? 'Apagar todas as mensagens desta conversa? O nome e as instruções serão preservados.'
              : action === 'delete'
                ? 'Excluir permanentemente esta conversa e seu histórico interno?'
                : 'Arquivar esta conversa?',
          buttons: ['Cancelar', 'Confirmar'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (result.response !== 1) return { canceled: true };
        body.confirmed = true;
        if (action === 'delete') body.delete = true;
        else if (action === 'clear') body.clear = true;
        else body.archived = true;
      }
      return backend('/chats/change', 'POST', JSON.stringify(body));
    });
    ipcMain.handle('jarvis:clear-storage', async (event, scope) => {
      if (!trusted(event) || !['local', 'cloud'].includes(scope))
        throw Error('Solicitação não autorizada.');
      const result = await dialog.showMessageBox(win, {
        type: 'warning',
        title: scope === 'cloud' ? 'Apagar chats na nuvem' : 'Limpar dados locais',
        message:
          scope === 'cloud'
            ? 'Apagar todos os seus chats e mensagens na nuvem, inclusive o Quick Chat?'
            : 'Apagar os dados internos de projetos e chats deste computador e os anexos locais desta conta?',
        detail:
          scope === 'cloud'
            ? 'Esta ação afeta todos os seus computadores e não pode ser desfeita. Sua conta, acesso e consumo registrado serão preservados.'
            : 'As pastas e arquivos originais, o login e suas preferências serão preservados. Outros usuários deste computador também perderão a memória dos projetos locais.',
        buttons: ['Cancelar', 'Apagar dados'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response !== 1) return { canceled: true };
      return backend('/desktop/storage/clear', 'POST', JSON.stringify({ scope, confirmed: true }));
    });
    ipcMain.handle('jarvis:open-link', async (event, value) => {
      if (!trusted(event) || typeof value !== 'string' || value.length > 2048)
        throw new Error('Link inválido.');
      let target;
      try {
        target = new URL(value);
      } catch {
        throw new Error('Link inválido.');
      }
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password)
        throw new Error('Link bloqueado.');
      const decision = await dialog.showMessageBox(win, {
        type: 'question',
        message: 'Abrir link no navegador?',
        detail: target.href,
        buttons: ['Cancelar', 'Abrir'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (decision.response === 1) await shell.openExternal(target.href);
    });
    ipcMain.handle('jarvis:copy-code', (event, text) => {
      if (!trusted(event) || typeof text !== 'string' || text.length > 100000) {
        throw new Error('Cópia não permitida.');
      }
      clipboard.writeText(text);
      clipboardManager?.ignoreText?.(text);
      return true;
    });
    ipcMain.handle('jarvis:api', async (event, route, options = {}) => {
      if (typeof route !== 'string' || route.length > 1024) throw new Error('Rota inválida.');
      const baseRoute = route.split('?')[0];
      if (
        !trusted(event) ||
        !routes.has(baseRoute) ||
        (route.includes('?') &&
          !['/chats/history', '/projects/knowledge', '/projects/selection'].includes(baseRoute))
      ) {
        throw new Error('Solicitação não autorizada.');
      }
      const method = routes.get(baseRoute);
      if (options.method && options.method !== method) throw new Error('Método não permitido.');
      if (
        options.body !== undefined &&
        (typeof options.body !== 'string' || options.body.length > 30000)
      ) {
        throw new Error('Conteúdo inválido.');
      }
      let result;
      if (baseRoute === '/chat' && process.env.JARVIS_CLOUD === '1') {
        if (!readiness.ready())
          throw Error('Aguarde o carregamento das suas informações e histórico.');
        if (activeStreams.has(event.sender.id)) throw Error('Uma resposta já está sendo gerada.');
        const controller = new AbortController();
        activeStreams.set(event.sender.id, controller);
        try {
          const token = (await fs.readFile(path.join(dataDir, '.local-token'), 'utf8')).trim();
          const response = await fetch('http://127.0.0.1:8765/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': token },
            body: options.body,
            redirect: 'error',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
          });
          // Only reveal the final result after server-side persistence succeeds.
          result = await require('../chat/local-stream').consume(response, () => {});
        } finally {
          activeStreams.delete(event.sender.id);
        }
      } else result = await backend(route, method, options.body);
      if (
        result.ok &&
        baseRoute === '/chat' &&
        process.env.JARVIS_CLOUD === '1' &&
        !result.data?.persisted?.chat
      )
        notifyWorkspaceChanged();
      if (result.ok && result.data?.spotify)
        for (const window of BrowserWindow.getAllWindows?.() || [])
          if (!window.isDestroyed()) window.webContents.send('spotify:changed');
      if (baseRoute === '/workspace/view' && result.ok)
        quickController?.setProject(result.data.project);
      return result;
    });
    ipcMain.on('window:minimize', (event) => {
      if (trusted(event)) win.minimize();
    });
    ipcMain.on('window:close', (event) => {
      if (trusted(event)) win.close();
    });
    ipcMain.handle('jarvis:quick-settings', (event) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return quickController.getSettings();
    });
    ipcMain.handle('jarvis:quick-configure', (event, value) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      return quickController.setSettings(value);
    });
    ipcMain.handle('jarvis:voice-preference', (event, value) => {
      if (!trusted(event) || typeof value !== 'boolean') throw Error('Solicitação não autorizada.');
      quickController?.setMasterVoice(value);
      clipboardManager?.setMasterSound(value);
    });
    ipcMain.handle('jarvis:audio-claim', (event) => {
      if (!trusted(event)) throw Error('Solicitação não autorizada.');
      quickController?.claimAudio(event.sender);
    });
    writerController = require('../writer/ipc').install({
      ipcMain,
      dialog,
      trusted,
      mainWindow: () => win,
      backend,
    });
    createWindow();
    clipboardManager = require('../clipboard/service').install({
      electron: require('electron'),
      dataDir,
      stateStorage,
      mainWindow: () => win,
      quickWindows: () => quickController?.windows || {},
      authenticated: () =>
        process.env.JARVIS_CLOUD !== '1' || process.env.JARVIS_AUTHENTICATED === '1',
    });
    function syncQuick(authenticated) {
      clipboardManager.setActive(authenticated);
      if (!authenticated) {
        for (const controller of activeStreams.values()) controller.abort();
        quickController?.destroy();
        quickController = null;
        return;
      }
      if (quickController) return;
      quickController = require('../quick/controller').createQuick({
        electron: require('electron'),
        backend,
        dataDir,
        mainWindow: () => win,
        isReady: () => process.env.JARVIS_CLOUD !== '1' || readiness.ready(),
        onCopy: (text) => clipboardManager?.ignoreText?.(text),
        openMain: showMain,
        quit: quitJarvis,
        enabled: initialSettings.quickChat !== false,
        stateStorage,
      });
    }
    app.on('jarvis:session-changed', (active) => {
      readiness.transition(active);
      syncQuick(active);
    });
    syncQuick(process.env.JARVIS_CLOUD !== '1' || process.env.JARVIS_AUTHENTICATED === '1');
  }
  app.whenReady().then(() => {
    if (!app.isPackaged) {
      initializeDesktop();
      return;
    }
    require('../session/backend-runtime')
      .start({
        resources: process.resourcesPath,
        dataDir,
        executable: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
        version: app.getVersion(),
        attempts: 1200,
      })
      .then(async (service) => {
        packagedBackend = service;
        if (process.env.JARVIS_CLOUD === '1') {
          initializeDesktop();
          return;
        }
        const unlocked = await backend('/desktop/key', 'GET');
        if (!unlocked.ok) throw Error('Cofre bloqueado.');
        stateStorage = require('../session/encrypted-state').create(dataDir, unlocked.data.key);
        for (const file of [
          'config/settings.json',
          'window-state.json',
          'quick-state.json',
          'config/browser-state.json',
        ])
          stateStorage.readJSON(path.join(dataDir, file));
        initializeDesktop();
      })
      .catch(() => {
        dialog.showErrorBox(
          'Cyro IA — inicialização',
          'Não foi possível iniciar o backend. Verifique se a porta 8765 está livre, se os arquivos do aplicativo estão íntegros e se você tem permissão para gravar os dados.',
        );
        app.exit(1);
      });
  });
  app.on('window-all-closed', () => {
    console.log('Todas as janelas foram fechadas.');
    app.quit();
  });

  process.on('uncaughtException', (error) => {
    console.error('ERRO Cyro: operação interrompida.');
  });

  app.on('before-quit', (event) => {
    clipboardManager?.destroy();
    if (packagedBackend && !backendStopped) {
      event.preventDefault();
      quitting = true;
      quickController?.destroy();
      const service = packagedBackend;
      packagedBackend = null;
      service
        .stop()
        .then(() => {
          backendStopped = true;
          if (openBackupsOnExit) {
            const child = require('node:child_process').spawn(
              path.join(process.resourcesPath, 'backend', 'jarvis-backend.exe'),
              [openBackupsOnExit],
              {
                shell: false,
                windowsHide: true,
                stdio: 'ignore',
                env: { ...process.env, JARVIS_DATA_DIR: dataDir },
              },
            );
            child.on('error', () => {
              dialog.showErrorBox('Cyro IA', 'Não foi possível abrir o gerenciador de backups.');
              app.quit();
            });
            child.once('exit', () => app.quit());
            win?.hide();
            return;
          }
          app.quit();
        })
        .catch(() => {
          dialog.showErrorBox(
            'Cyro IA',
            'O backend não confirmou o encerramento. O monitor do processo principal finalizará a instância própria.',
          );
          app.exit(1);
        });
      return;
    }
    quitting = true;
    quickController?.destroy();
    console.log('Cyro está encerrando...');
  });
}

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const core = require('./quick-core');
function createQuick({
  electron,
  backend,
  dataDir,
  mainWindow,
  openMain,
  quit,
  enabled = true,
  stateStorage = null,
  now = () => performance.now(),
  schedule = setInterval,
  cancel = clearInterval,
}) {
  const { BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, clipboard } = electron;
  const file = path.join(dataDir, 'quick-state.json'),
    url = pathToFileURL(path.join(__dirname, 'quick.html')).href;
  let config = { ...core.defaults },
    position = null,
    masterVoice = true,
    expanded = false,
    answerVisible = false,
    busy = false,
    pinned = false,
    answer = '',
    spokenAnswer = '',
    question = '',
    error = '',
    project = null,
    usedProject = null,
    lastChatId = null,
    voiceEpoch = 0,
    voicing = false,
    disposed = false,
    responseHeight = 230,
    composerHeight = 150;
  const windows = {},
    shapeSizes = {},
    clock = new core.Clock(now);
  try {
    if (!fs.lstatSync(file).isSymbolicLink()) {
      const saved = stateStorage
        ? stateStorage.readJSON(file)
        : JSON.parse(fs.readFileSync(file, 'utf8'));
      config = core.settings(saved.settings);
      if (!saved.voicePreferenceVersion) config.voice = true;
      if (!saved.appearanceVersion && config.opacity === 0.82)
        config.opacity = core.defaults.opacity;
      if (Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y))
        position = saved.position;
    }
  } catch {}
  function persist() {
    if (stateStorage) {
      stateStorage.writeJSON(file, {
        appearanceVersion: 1,
        voicePreferenceVersion: 1,
        settings: config,
        position,
      });
      return;
    }
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(
        temporary,
        JSON.stringify({
          appearanceVersion: 1,
          voicePreferenceVersion: 1,
          settings: config,
          position,
        }),
        { flag: 'wx' },
      );
      fs.renameSync(temporary, file);
    } catch {
      try {
        fs.unlinkSync(temporary);
      } catch {}
    }
  }
  function display() {
    return core.nearest(position, screen.getAllDisplays());
  }
  const primary = screen.getPrimaryDisplay().workArea;
  position = position || {
    x: primary.x + primary.width - 80,
    y: primary.y + Math.round(primary.height * 0.6),
  };
  position = core.clamp(position, display().workArea);
  function state() {
    return {
      config,
      expanded,
      answerVisible,
      busy,
      pinned,
      answer,
      question,
      error,
      project: project ? { id: project.id, name: project.name } : null,
      usedProject,
      voicing,
      masterVoice,
      hovered: [...clock.reasons].some((reason) => reason.startsWith('hover:')),
      remaining: Math.ceil(clock.tick() / 1000),
    };
  }
  function publish() {
    const value = state();
    for (const window of Object.values(windows))
      if (!window.isDestroyed()) window.webContents.send('quick:state', value);
  }
  function safeWindow(kind, width, height) {
    const window = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: kind !== 'orb',
      focusable: kind !== 'orb',
      webPreferences: {
        ...(stateStorage ? { partition: 'jarvis-private' } : {}),
        ...(stateStorage ? { additionalArguments: ['--jarvis-encrypted-storage'] } : {}),
        preload: path.join(__dirname, 'quick-preload.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    window.setAlwaysOnTop(true, 'floating');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.loadFile(path.join(__dirname, 'quick.html'), { query: { panel: kind } });
    window.webContents.on('did-finish-load', () => {
      publish();
      if (kind === 'composer' && expanded) window.webContents.send('quick:focus');
    });
    window.on('close', (event) => {
      if (!disposed) {
        event.preventDefault();
        collapse();
      }
    });
    windows[kind] = window;
    return window;
  }
  safeWindow('orb', core.ICON_SIZE, core.ICON_SIZE);
  safeWindow('composer', 360, 150);
  safeWindow('response', 360, 230);
  if (process.platform === 'win32') windows.orb.setShape(core.circle());
  function layout() {
    position = core.clamp(position, display().workArea);
    windows.orb.setBounds({ ...position, width: core.ICON_SIZE, height: core.ICON_SIZE });
    const bounds = core.panels(position, display().workArea, responseHeight, composerHeight);
    windows.composer.setBounds(bounds.input);
    windows.response.setBounds(bounds.response);
    if (process.platform === 'win32')
      for (const [kind, box] of [
        ['composer', bounds.input],
        ['response', bounds.response],
      ]) {
        const key = box.width + 'x' + box.height;
        if (shapeSizes[kind] !== key) {
          windows[kind].setShape(core.rounded(box.width, box.height));
          shapeSizes[kind] = key;
        }
      }
  }
  function stopVoice() {
    if (disposed) return;
    voiceEpoch++;
    voicing = false;
    clock.pause('audio', false);
    windows.response.webContents.send('jarvis:stop-audio');
    publish();
  }
  function hide() {
    pinned = false;
    answerVisible = false;
    windows.response.hide();
    for (const reason of [...clock.reasons])
      if (!['hover:composer', 'hover:orb'].includes(reason)) clock.reasons.delete(reason);
    stopVoice();
    publish();
  }
  function collapse() {
    expanded = false;
    windows.composer.hide();
    clock.pause('hover:composer', false);
    hide();
    publish();
  }
  function toggle() {
    if (expanded) {
      collapse();
      return;
    }
    expanded = true;
    layout();
    windows.composer.show();
    windows.composer.focus();
    windows.composer.webContents.send('quick:focus');
    publish();
  }
  function showAnswer() {
    answerVisible = true;
    if (expanded) windows.response.showInactive();
    publish();
  }
  function claimAudio(owner) {
    if (owner !== windows.response.webContents) stopVoice();
    for (const window of [mainWindow(), ...Object.values(windows)])
      if (window && !window.isDestroyed() && window.webContents !== owner)
        window.webContents.send('jarvis:stop-audio');
  }
  async function speak() {
    if (!config.voice || !masterVoice || !answer || !answerVisible) return;
    error = '';
    stopVoice();
    const epoch = voiceEpoch;
    voicing = true;
    clock.pause('audio', true);
    publish();
    try {
      const result = await backend(
        '/speak',
        'POST',
        JSON.stringify({
          message: (spokenAnswer || answer)
            .replace(/```[\s\S]*?```/g, ' O exemplo está na conversa completa. ')
            .slice(0, 4000),
        }),
      );
      if (epoch !== voiceEpoch || !masterVoice || !config.voice || !answerVisible) return;
      if (!result.ok || typeof result.data?.audio_base64 !== 'string' || !result.data.audio_base64)
        throw Error('Não foi possível gerar o áudio.');
      claimAudio(windows.response.webContents);
      windows.response.webContents.send('quick:audio', { data: result.data.audio_base64, epoch });
    } catch {
      if (epoch === voiceEpoch) {
        stopVoice();
        error = 'Áudio indisponível; a resposta continua disponível.';
        publish();
      }
    }
  }
  async function send(message, useProject) {
    if (disposed) throw Error('Quick Chat encerrado.');
    if (busy) throw Error('Aguarde a resposta atual.');
    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 6000 ||
      typeof useProject !== 'boolean'
    )
      throw Error('Pergunta inválida.');
    if (useProject && !project) throw Error('Selecione um projeto na janela principal.');
    const selected = useProject ? { ...project } : null;
    usedProject = selected?.name || null;
    question = message.trim();
    busy = true;
    answer = '';
    error = '';
    pinned = false;
    clock.pause('pin', false);
    clock.pause('copy', false);
    clock.pause('busy', true);
    stopVoice();
    showAnswer();
    publish();
    try {
      if (selected) {
        const size = await backend(
          '/projects/selection/size',
          'POST',
          JSON.stringify({ project_id: selected.id }),
        );
        if (!size.ok)
          throw Error(size.data?.detail || 'Não foi possível conferir o tamanho do projeto.');
        if (!Number.isFinite(size.data.selected_bytes) || !Number.isFinite(size.data.max_bytes))
          throw Error('Não foi possível conferir o tamanho do projeto.');
        if (!size.data.within_limit || size.data.selected_bytes > size.data.max_bytes)
          throw Error('O projeto ultrapassa 5 MB. Remova arquivos da seleção antes de enviar.');
      }
      const result = await backend(
        '/quick/chat',
        'POST',
        JSON.stringify({ message: question, project_id: selected?.id || null }),
      );
      if (disposed) return { ok: false };
      if (!result.ok) throw Error(result.data?.detail || 'Não foi possível consultar o backend.');
      if (result.data.spotify)
        for (const window of [mainWindow(), ...Object.values(windows)])
          if (window && !window.isDestroyed()) window.webContents.send('spotify:changed');
      answer = result.data.reply;
      spokenAnswer = result.data.speech_text || answer;
      lastChatId = result.data.chat_id || null;
      busy = false;
      clock.pause('busy', false);
      clock.reset(core.duration(answer, config));
      if (expanded) showAnswer();
      publish();
      if (config.voice && masterVoice && expanded) void speak();
      return { ok: true };
    } catch (failure) {
      if (disposed) return { ok: false };
      busy = false;
      error = failure.message?.includes('5 MB')
        ? failure.message
        : 'Não foi possível obter a resposta. Confira o backend e tente novamente. Sua pergunta foi mantida.';
      clock.pause('busy', false);
      clock.reset(config.maxSeconds * 1000);
      if (expanded) showAnswer();
      publish();
      return { ok: false };
    }
  }
  const permissions = {
    orb: ['toggle', 'move', 'state', 'pause'],
    composer: ['resize-input', 'send', 'state', 'collapse', 'pause', 'voice'],
    response: [
      'state',
      'resize',
      'pause',
      'pin',
      'hide',
      'copy',
      'open-main',
      'speak',
      'stop',
      'claim',
      'voice',
      'audio-failed',
      'audio-ended',
    ],
  };
  function trusted(event, action) {
    const role = Object.keys(windows).find(
      (key) =>
        event.sender === windows[key].webContents &&
        event.senderFrame === windows[key].webContents.mainFrame &&
        event.senderFrame.url === url + '?panel=' + key,
    );
    return role && permissions[role].includes(action) ? role : null;
  }
  const actions = {
    state: () => state(),
    toggle,
    collapse,
    hide,
    send,
    move: (x, y, save) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        Math.abs(x) > 100000 ||
        Math.abs(y) > 100000 ||
        typeof save !== 'boolean'
      )
        throw Error('Posição inválida.');
      position = { x, y };
      layout();
      if (save) persist();
      return position;
    },
    'resize-input': (height) => {
      if (!Number.isFinite(height) || height < 150 || height > 480) throw Error('Altura inválida.');
      composerHeight = height;
      layout();
    },
    resize: (height) => {
      if (!Number.isFinite(height) || height < 90 || height > 600) throw Error('Altura inválida.');
      responseHeight = height;
      layout();
    },
    pause: (reason, value) => {
      if (
        !['hover:orb', 'hover:composer', 'hover:response', 'selection', 'copy'].includes(reason) ||
        typeof value !== 'boolean'
      )
        throw Error('Pausa inválida.');
      clock.pause(reason, value);
      publish();
    },
    pin: (value) => {
      if (typeof value !== 'boolean') throw Error('Fixação inválida.');
      pinned = value;
      clock.pause('pin', value);
      publish();
    },
    copy: () => {
      clock.pause('copy', true);
      clipboard.writeText(answer);
      setTimeout(() => {
        clock.pause('copy', false);
        publish();
      }, 2000);
    },
    'open-main': async () => {
      if (lastChatId) {
        openMain(lastChatId);
        return;
      }
      const result = await backend('/quick/session', 'GET');
      if (!result.ok) throw Error('Backend indisponível.');
      openMain(result.data.chat_id);
    },
    voice: (value) => {
      if (typeof value !== 'boolean') throw Error('Preferência inválida.');
      config.voice = value;
      if (!value) stopVoice();
      persist();
      publish();
    },
    'audio-failed': (epoch) => {
      if (epoch !== voiceEpoch || !voicing) return;
      stopVoice();
      error = 'Não foi possível reproduzir a voz. Use Ouvir para tentar novamente.';
      publish();
    },
    'audio-ended': (epoch) => {
      if (epoch === voiceEpoch) stopVoice();
    },
    speak,
    stop: stopVoice,
    claim: () => claimAudio(windows.response.webContents),
  };
  for (const [action, callback] of Object.entries(actions))
    ipcMain.handle('quick:' + action, (event, ...args) => {
      const role = trusted(event, action);
      if (!role) throw Error('Solicitação não autorizada.');
      if (action === 'pause' && args[0] === 'hover') args[0] = 'hover:' + role;
      return callback(...args);
    });
  function monitors() {
    layout();
    persist();
  }
  screen.on('display-added', monitors);
  screen.on('display-removed', monitors);
  screen.on('display-metrics-changed', monitors);
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4,
        inside = (x - 16) ** 2 + (y - 16) ** 2 < 225,
        j =
          (x >= 19 && x <= 21 && y >= 7 && y <= 22) ||
          (y >= 22 && y <= 24 && x >= 11 && x <= 20) ||
          (x >= 9 && x <= 12 && y >= 19 && y <= 23);
      pixels[i] = j ? 248 : inside ? 66 : 0;
      pixels[i + 1] = j ? 224 : inside ? 44 : 0;
      pixels[i + 2] = j ? 170 : inside ? 20 : 0;
      pixels[i + 3] = inside ? 255 : 0;
    }
  let tray = null;
  try {
    tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }));
    tray.setToolTip('JARVIS · Quick Chat');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir JARVIS', click: () => openMain() },
        { label: 'Quick Chat', click: toggle },
        { type: 'separator' },
        { label: 'Encerrar JARVIS', click: quit },
      ]),
    );
    tray.on('double-click', () => openMain());
  } catch {
    config.closeToTray = false;
  }
  const timer = schedule(() => {
    if (disposed) return;
    if (answerVisible && !busy && clock.tick() <= 0) hide();
    else if (answerVisible) publish();
  }, 250);
  layout();
  windows.orb.once('ready-to-show', () => {
    if (enabled) windows.orb.showInactive();
  });
  persist();
  return {
    windows,
    getSettings: () => ({ ...config }),
    setSettings(value) {
      config = core.settings({ ...config, ...value });
      if (!config.voice) stopVoice();
      if (answer) clock.reset(core.duration(answer, config));
      persist();
      publish();
      return { ...config };
    },
    setProject(value) {
      project = value ? { id: value.id, name: value.name } : null;
      publish();
    },
    setMasterVoice(value) {
      masterVoice = value;
      if (!value) stopVoice();
    },
    claimAudio,
    hideOnClose: () => false,
    destroy() {
      if (disposed) return;
      disposed = true;
      cancel(timer);
      voiceEpoch++;
      for (const name of ['display-added', 'display-removed', 'display-metrics-changed'])
        screen.removeListener(name, monitors);
      for (const action of Object.keys(actions)) ipcMain.removeHandler('quick:' + action);
      for (const window of Object.values(windows)) if (!window.isDestroyed()) window.destroy();
      tray?.destroy();
    },
    toggle,
  };
}
module.exports = { createQuick };

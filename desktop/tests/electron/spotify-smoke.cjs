require('electron').ipcMain.handle('jarvis:workspace-ready', () => true);
const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
// Real Electron/preloads/IPC/UI with synthetic Cloud/OAuth responses. No external account.
const electron = require('electron');
const { app, BrowserWindow, ipcMain } = electron;
const path = require('node:path'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
app.disableHardwareAcceleration();
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'jarvis-spotify-smoke-'));
app.setPath('userData', path.join(directory, 'profile'));
let main,
  quick,
  connected = false,
  configured = false,
  opened = [],
  commands = [];
const timeout = setTimeout(() => finish(1, 'Spotify smoke excedeu o tempo.'), 30000);
function finish(code, message) {
  clearTimeout(timeout);
  main?.destroy();
  quick?.destroy();
  if (message) console[code ? 'error' : 'log'](message);
  app.exit(code);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(win, condition) {
  for (let i = 0; i < 200; i++) {
    if (await win.webContents.executeJavaScript(condition)) return;
    await pause(50);
  }
  throw Error('Condição visual não foi atendida.');
}
app.whenReady().then(async () => {
  try {
    process.env.JARVIS_AUTHENTICATED = '1';
    const service = {
      current: () => ({ origin: 'https://jarvis.example.test', credential: 'synthetic-session' }),
      request: async (route, method, input) => {
        assert.equal(route, '/api/integrations/spotify');
        if (input.operation === 'status')
          return {
            configured,
            status: connected ? 'connected' : 'disconnected',
            displayName: connected ? 'Conta de teste' : null,
          };
        if (input.operation === 'start')
          return {
            transactionId: 'synthetic-transaction',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            authorizationUrl:
              'https://jarvis.example.test/api/integrations/spotify/authorize?ticket=' +
              'a'.repeat(43),
          };
        if (input.operation === 'poll') {
          connected = true;
          return { status: 'completed' };
        }
        if (input.operation === 'disconnect') {
          connected = false;
          return { ok: true };
        }
        if (input.operation === 'control') {
          commands.push(input.command.action);
          if (input.command.action === 'playback')
            return {
              playback: {
                playing: true,
                track: {
                  name: 'Faixa de teste',
                  artist: 'Artista de teste',
                  url: 'https://open.spotify.com/track/1234567890123456789012',
                },
                device: { supportsVolume: true, volume: 40 },
              },
            };
          return { ok: true };
        }
      },
    };
    require('../../scripts/integrations/spotify-ipc').installSpotifyIPC({
      electron: {
        ...electron,
        shell: { openExternal: async (url) => opened.push(url) },
        dialog: { showMessageBox: async () => ({ response: 1 }) },
      },
      service: () => service,
    });
    for (const name of [
      'jarvis:initial-settings',
      'jarvis:voice-preference',
      'jarvis:cloud-state',
      'jarvis:audio-claim',
    ])
      ipcMain.handle(name, () => ({}));
    ipcMain.handle('jarvis:api', () => ({
      ok: true,
      data: { projects: [], chats: [], histories: {}, project: null, messages: [] },
    }));
    ipcMain.handle('clipboard:state', () => ({
      pending: false,
      owned: {},
      settings: { enabled: false },
    }));
    ipcMain.handle('quick:state', () => ({
      config: { opacity: 0.95, voice: false },
      masterVoice: false,
      busy: false,
    }));
    ipcMain.handle('quick:resize-input', () => {});
    main = new BrowserWindow({
      width: 1100,
      height: 800,
      show: false,
      webPreferences: {
        offscreen: true,
        preload: path.join(DESKTOP_ROOT, 'scripts/app/preload.js'),
        sandbox: true,
        contextIsolation: true,
      },
    });
    quick = new BrowserWindow({
      width: 360,
      height: 480,
      show: false,
      webPreferences: {
        offscreen: true,
        preload: path.join(DESKTOP_ROOT, 'scripts/quick/preload.js'),
        sandbox: true,
        contextIsolation: true,
      },
    });
    await main.loadFile(path.join(DESKTOP_ROOT, 'index.html'));
    await quick.loadFile(path.join(DESKTOP_ROOT, 'quick.html'), { query: { panel: 'composer' } });
    for (const win of [main, quick])
      await win.webContents.executeJavaScript(
        "Object.defineProperty(document,'hidden',{value:false});void 0;",
      );
    await wait(main, "!!document.getElementById('settings-open')");
    await main.webContents.executeJavaScript(
      "document.getElementById('settings-open').click();void 0;",
    );
    await wait(main, "!!document.querySelector('#settings-tabs button')");
    await main.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('#settings-tabs button')).find(b=>b.textContent==='Integrações').click();void 0;",
    );
    await wait(main, "!!document.querySelector('[data-integration-id=spotify]')");
    await main.webContents.executeJavaScript(
      "document.querySelector('[data-integration-id=spotify]').click();void 0;",
    );
    await wait(
      main,
      "Array.from(document.querySelectorAll('.spotify-settings button')).some(b=>b.textContent==='Conectar')",
    );
    assert.equal(
      await main.webContents.executeJavaScript(
        "Array.from(document.querySelectorAll('.spotify-settings button')).find(b=>b.textContent==='Conectar').disabled",
      ),
      true,
    );
    configured = true;
    await main.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('.spotify-settings button')).find(b=>b.textContent==='Atualizar conexão').click();void 0;",
    );
    await wait(
      main,
      "Array.from(document.querySelectorAll('.spotify-settings button')).some(b=>b.textContent==='Conectar'&&!b.disabled)",
    );
    await main.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('.spotify-settings button')).find(b=>b.textContent==='Conectar').click();void 0;",
    );
    await wait(
      main,
      "document.querySelector('.spotify-settings [role=status]').textContent.includes('Conectado')",
    );
    assert.equal(opened.length, 1);
    assert.equal(new URL(opened[0]).hostname, 'jarvis.example.test');
    await pause(100);
    fs.writeFileSync(
      path.join(directory, 'spotify-connected.png'),
      (await main.webContents.capturePage()).toPNG(),
    );
    for (const win of [main, quick])
      assert.equal(
        await win.webContents.executeJavaScript("document.querySelector('.spotify-player')===null"),
        true,
      );
    await main.webContents.executeJavaScript(
      "document.querySelector('#settings-dialog .dialog-header button').click();void 0;",
    );
    assert.equal(commands.length, 0, 'nenhuma consulta ou reprodução automática pelo painel');
    await wait(main, "!!document.getElementById('settings-open')");
    await main.webContents.executeJavaScript(
      "document.getElementById('settings-open').click();void 0;",
    );
    await wait(main, "!!document.querySelector('#settings-tabs button')");
    await main.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('#settings-tabs button')).find(b=>b.textContent==='Integrações').click();void 0;",
    );
    await wait(main, "!!document.querySelector('[data-integration-id=spotify]')");
    await main.webContents.executeJavaScript(
      "document.querySelector('[data-integration-id=spotify]').click();void 0;",
    );
    await wait(
      main,
      "Array.from(document.querySelectorAll('.spotify-settings button')).some(b=>b.textContent==='Desconectar')",
    );
    await main.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('.spotify-settings button')).find(b=>b.textContent==='Desconectar').click();void 0;",
    );
    await wait(
      main,
      "document.querySelector('.spotify-settings [role=status]').textContent.includes('Não conectado')",
    );
    assert.equal(connected, false);
    finish(
      0,
      'Electron real Spotify: configurações, browser IPC restrito, conclusão OAuth simulada, ausência de player/controles principal e Quick Chat, nenhuma reprodução automática e desconectar: OK. Sem conta/credenciais/API Spotify reais. Capturas: ' +
        directory,
    );
  } catch (error) {
    finish(1, error.stack);
  }
});

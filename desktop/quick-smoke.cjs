const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
  clipboard,
} = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
app.disableHardwareAcceleration();
// This legacy fixture does not run the clipboard service; its state stays disabled.
ipcMain.handle('clipboard:state', () => ({
  pending: false,
  owned: {},
  settings: { enabled: false },
}));
ipcMain.handle('clipboard:claim', () => ({ ok: false, reason: 'DISABLED' }));
const temp = fs.mkdtempSync(path.join(app.getPath('temp'), 'jarvis-quick-smoke-'));
app.setPath('userData', path.join(temp, 'profile'));
let main,
  controller,
  tick,
  clock = 0,
  opened = [];
const timer = setTimeout(() => {
  console.error('Tempo de teste Quick Chat excedido');
  controller?.destroy();
  main?.destroy();
  app.exit(1);
}, 35000);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wav = Buffer.alloc(44 + 8000);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(8000, 40);
app.whenReady().then(async () => {
  try {
    main = new BrowserWindow({
      width: 900,
      height: 600,
      show: false,
      skipTaskbar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await main.loadURL('about:blank');
    main.minimize();
    await delay(100);
    const create = () =>
      require('./quick-controller').createQuick({
        electron: { BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, clipboard },
        backend: async (route, method, body) => {
          if (route === '/quick/session') return { ok: true, data: { chat_id: 'quick-fixture' } };
          if (route === '/speak')
            return { ok: true, data: { audio_base64: wav.toString('base64') } };
          assert.equal(route, '/quick/chat');
          assert.equal(JSON.parse(body).project_id, null);
          await delay(50);
          return {
            ok: true,
            data: {
              reply:
                'A causa provável é uma sessão expirada. Valide o token no backend antes de carregar o usuário e trate respostas 401 no frontend. Esta é uma hipótese: confira o erro completo e as linhas responsáveis antes de aplicar a solução manualmente.',
            },
          };
        },
        dataDir: path.join(temp, 'data'),
        mainWindow: () => main,
        openMain: (id) => opened.push(id),
        quit: () => app.quit(),
        now: () => clock,
        schedule: (fn) => {
          tick = fn;
          return 1;
        },
        cancel() {},
      });
    controller = create();
    await Promise.all(
      Object.values(controller.windows).map(
        (window) => new Promise((resolve) => window.webContents.once('did-finish-load', resolve)),
      ),
    );
    const { orb, composer, response } = controller.windows;
    for (let attempt = 0; attempt < 40 && !orb.isVisible(); attempt++) await delay(50);
    assert.equal(main.isMinimized(), true);
    assert.equal(orb.isAlwaysOnTop(), true);
    assert.equal(orb.isVisible(), true);
    assert.equal(orb.getBounds().width, 42);
    await orb.webContents.executeJavaScript('window.quick.toggle()');
    assert.equal(composer.isVisible(), true);
    await response.webContents.executeJavaScript(
      `window.played=0;window.NativeAudio=window.Audio;window.Audio=function(src){const media=new window.NativeAudio(src);media.muted=true;const play=media.play.bind(media);media.play=async()=>{await play();window.played++;};return media;};void 0;`,
    );
    const field = await composer.webContents.executeJavaScript(
      `(()=>{const el=document.getElementById('question');el.focus();el.value='Início da mensagem sem corte';const s=getComputedStyle(el);return {padding:parseFloat(s.paddingLeft),outline:s.outlineStyle,left:el.getBoundingClientRect().left,scroll:el.scrollLeft};})()`,
    );
    assert.ok(field.padding >= 12);
    assert.equal(field.outline, 'none');
    assert.equal(field.scroll, 0);
    await composer.webContents.executeJavaScript(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    fs.writeFileSync(
      path.join(app.getPath('temp'), 'jarvis-v083-input.png'),
      (await composer.webContents.capturePage()).toPNG(),
    );
    await composer.webContents.executeJavaScript(
      `(async()=>{document.getElementById('question').value='Qual a causa do erro no login?';await document.getElementById('send').onclick();})()`,
    );
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await response.webContents.executeJavaScript('window.played>0')) break;
      await delay(25);
    }
    assert.equal(await response.webContents.executeJavaScript('window.played'), 1);
    await response.webContents.executeJavaScript('window.quick.stop()');
    await response.webContents.executeJavaScript(`document.getElementById('listen').click()`);
    await delay(100);
    assert.equal(await response.webContents.executeJavaScript('window.played'), 2);
    await response.webContents.executeJavaScript('window.quick.stop()');
    assert.equal(response.isVisible(), true);
    assert.equal(main.isMinimized(), true);
    assert.match(
      await response.webContents.executeJavaScript(
        `getComputedStyle(document.getElementById('response')).backgroundColor`,
      ),
      /0\.66/,
    );
    assert.equal(
      await response.webContents.executeJavaScript(
        `getComputedStyle(document.getElementById('answer')).opacity`,
      ),
      '1',
    );
    assert.equal(opened.length, 0);
    assert.match(
      await response.webContents.executeJavaScript(`document.getElementById('answer').textContent`),
      /sessão expirada/,
    );
    const bounds = response.getBounds(),
      input = composer.getBounds();
    assert.ok(bounds.y + bounds.height < input.y);
    await response.webContents.executeJavaScript(`window.quick.pause('hover',true)`);
    await delay(220);
    assert.match(
      await response.webContents.executeJavaScript(
        `getComputedStyle(document.getElementById('response')).backgroundColor`,
      ),
      /0\.66/,
    );
    clock = 60000;
    tick();
    assert.equal(response.isVisible(), true);
    await response.webContents.executeJavaScript(`window.quick.pin(true)`);
    await response.webContents.executeJavaScript(`window.quick.pause('hover',false)`);
    clock = 90000;
    tick();
    assert.equal(response.isVisible(), true);
    await response.webContents.executeJavaScript(
      'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
    );
    fs.writeFileSync(
      path.join(app.getPath('temp'), 'jarvis-v08-quick-response.png'),
      (await response.webContents.capturePage()).toPNG(),
    );
    fs.writeFileSync(
      path.join(app.getPath('temp'), 'jarvis-v08-quick-input.png'),
      (await composer.webContents.capturePage()).toPNG(),
    );
    const area = screen.getPrimaryDisplay().workArea;
    await orb.webContents.executeJavaScript(
      `window.quick.move(${area.x + 20},${area.y + 100},true)`,
    );
    assert.equal(orb.getBounds().x, area.x + 24);
    await response.webContents.executeJavaScript('window.quick.openMain()');
    assert.deepEqual(opened, ['quick-fixture']);
    await response.webContents.executeJavaScript('window.quick.pin(false)');
    // Moving native windows may put them under the physical mouse. Explicitly
    // leave every surface before testing expiration without interaction.
    await delay(100);
    for (const panel of [orb, composer, response]) {
      await panel.webContents.executeJavaScript("window.quick.pause('hover',false)");
    }
    clock = 150000;
    tick();
    assert.equal(response.isVisible(), false);
    await composer.webContents.executeJavaScript('window.quick.collapse()');
    assert.equal(composer.isVisible(), false);
    assert.equal(orb.isVisible(), true);
    await orb.webContents.executeJavaScript('window.quick.toggle()');
    assert.equal(composer.isVisible(), true);
    assert.equal(response.isVisible(), false);
    await composer.webContents.executeJavaScript('window.quick.collapse()');
    controller.destroy();
    controller = create();
    assert.equal(controller.windows.orb.getBounds().x, area.x + 20);
    const fullscreen = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      skipTaskbar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await fullscreen.loadURL('about:blank');
    fullscreen.setFullScreen(true);
    await delay(200);
    assert.equal(fullscreen.isFullScreen(), true);
    assert.equal(controller.windows.orb.isAlwaysOnTop(), true);
    fullscreen.destroy();
    controller.destroy();
    main.destroy();
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    clearTimeout(timer);
    console.log(
      'Quick Chat Electron real: principal minimizada, ícone independente, IPC, entrada, resposta acima, hover, fixação, tempo, histórico e posição após recriação aprovados. Capturas jarvis-v08-quick-response.png e jarvis-v08-quick-input.png.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    controller?.destroy();
    main?.destroy();
    clearTimeout(timer);
    app.exit(1);
  }
});

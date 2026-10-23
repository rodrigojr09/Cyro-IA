// Real Electron windows/preloads/IPC/overlay API, with synthetic clipboard input and backend.
// Deliberately leaves the user's Windows clipboard and account untouched.
const electron = require('electron');
const { app, BrowserWindow, ipcMain } = electron;
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'jarvis-clipboard-smoke-'));
app.setPath('userData', path.join(directory, 'profile'));
let main,
  quick,
  manager,
  text = 'Baseline existente',
  copiedImage = null,
  sends = 0,
  overlays = [],
  focusedBefore;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => finish(1, 'Tempo de teste clipboard excedido.'), 60000);
function finish(code, message) {
  clearTimeout(timeout);
  manager?.destroy();
  quick?.destroy();
  main?.destroy();
  if (message) console[code ? 'error' : 'log'](message);
  app.exit(code);
}
app.whenReady().then(async () => {
  try {
    // Exercise this installed Electron's real, read-only Windows API before synthetic copies.
    let nativeReads = 0,
      nativeReadSucceeded = false;
    const nativeManager = require('./clipboard-manager').createClipboardManager({
      clipboard: {
        read: async () => {
          nativeReads++;
          const items = await electron.clipboard.read();
          nativeReadSucceeded = true;
          return items;
        },
      },
      nativeImage: electron.nativeImage,
      config: { ...require('./clipboard-manager').defaults, enabled: true },
      schedule: () => 1,
      cancel() {},
    });
    nativeManager.setActive(true);
    await nativeManager.tick();
    assert.equal(nativeReads, 1);
    assert.equal(nativeReadSucceeded, true);
    assert.equal(nativeManager.state().pending, false);
    nativeManager.destroy();
    // Existing page scripts may request unrelated services. Keep those local and synthetic.
    for (const name of [
      'jarvis:initial-settings',
      'jarvis:voice-preference',
      'jarvis:cloud-state',
      'jarvis:quick-settings',
      'jarvis:api',
    ])
      ipcMain.handle(name, () =>
        name === 'jarvis:api' ? { ok: true, data: { projects: [], chats: [], messages: [] } } : {},
      );
    main = new BrowserWindow({
      width: 1000,
      height: 800,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    const realOverlay = main.setOverlayIcon.bind(main);
    main.setOverlayIcon = (icon, description) => {
      overlays.push(!!icon);
      realOverlay(icon, description);
    };
    manager = require('./clipboard-service').install({
      electron: {
        ...electron,
        clipboard: {
          read: async () => [
            new electron.ClipboardItem(
              copiedImage
                ? { 'image/png': new Blob([copiedImage.toPNG()], { type: 'image/png' }) }
                : { 'text/plain': new Blob([text], { type: 'text/plain' }) },
            ),
          ],
        },
      },
      dataDir: directory,
      mainWindow: () => main,
      quickWindows: () => quick?.windows || {},
      authenticated: () => true,
    });
    quick = require('./quick-controller').createQuick({
      electron,
      dataDir: directory,
      mainWindow: () => main,
      openMain: () => {
        main.restore();
        main.show();
      },
      quit: () => {},
      backend: async () => {
        sends++;
        return { ok: true, data: { reply: 'Resposta sintética', chat_id: 'existing-chat' } };
      },
    });
    await main.loadFile(path.join(__dirname, 'index.html'));
    const { orb, composer, response } = quick.windows;
    for (
      let i = 0;
      i < 100 && Object.values(quick.windows).some((w) => w.webContents.isLoading());
      i++
    )
      await delay(30);
    await main.webContents.executeJavaScript(
      `window.jarvisWorkspace = {chat:{id:'existing-chat'}};window.jarvisClipboardSend=async()=>true;void 0;`,
    );
    await main.webContents.executeJavaScript(
      `window.clipboardChimes=0;window.clipboardDecoded=0;
       window.NativeClipboardAudio=window.Audio;
       window.Audio=function(source){const media=new window.NativeClipboardAudio(source);media.muted=true;const play=media.play.bind(media);media.play=async()=>{await play();window.clipboardDecoded++;};return media;};
       window.jarvisClipboard.onSound(()=>window.clipboardChimes++);void 0;`,
    );
    await main.webContents.executeJavaScript(
      'window.jarvisClipboard.configure({enabled:true,sound:true,volume:0.1})',
    );
    manager.setActive(true);
    await manager.tick();
    manager.setMasterSound(true);
    quick.setMasterVoice(false);
    main.show();
    main.minimize();
    await delay(150);
    focusedBefore = BrowserWindow.getFocusedWindow();
    text = 'Texto copiado para teste no Electron';
    await manager.tick();
    await delay(120);
    assert.equal(main.isMinimized(), true);
    assert.equal(BrowserWindow.getFocusedWindow(), focusedBefore);
    assert.equal(composer.isVisible(), false);
    assert.equal(
      await orb.webContents.executeJavaScript("document.getElementById('clipboard-dot').hidden"),
      false,
    );
    assert.equal(await main.webContents.executeJavaScript('window.clipboardChimes'), 1);
    for (
      let i = 0;
      i < 40 && !(await main.webContents.executeJavaScript('window.clipboardDecoded'));
      i++
    )
      await delay(25);
    assert.equal(await main.webContents.executeJavaScript('window.clipboardDecoded'), 1);
    if (process.platform === 'win32') assert.equal(overlays.at(-1), true);
    await orb.webContents.executeJavaScript('window.quick.toggle()');
    await delay(200);
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-card').hidden",
      ),
      false,
    );
    assert.equal(
      await main.webContents.executeJavaScript("document.getElementById('clipboard-card').hidden"),
      true,
    );
    assert.equal(
      await orb.webContents.executeJavaScript("document.getElementById('clipboard-dot').hidden"),
      true,
    );
    if (process.platform === 'win32') assert.equal(overlays.at(-1), false);
    assert.equal(sends, 0);
    await composer.webContents.executeJavaScript(
      "document.getElementById('clipboard-title').click();void 0;",
    );
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-original').textContent",
      ),
      text,
    );
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-title').getAttribute('aria-expanded')",
      ),
      'true',
    );
    fs.writeFileSync(
      path.join(directory, 'clipboard-text.png'),
      (await composer.webContents.capturePage()).toPNG(),
    );
    await composer.webContents.executeJavaScript(
      "document.getElementById('clipboard-title').click();void 0;",
    );
    assert.ok(composer.getBounds().height < 300, 'As opções devem manter o Quick Chat compacto.');
    fs.writeFileSync(
      path.join(directory, 'clipboard-options.png'),
      (await composer.webContents.capturePage()).toPNG(),
    );
    // The orb and response have no right to claim payloads or configure monitoring.
    assert.equal(
      await orb.webContents.executeJavaScript('window.jarvisClipboard.claim().then(x=>x.ok)'),
      false,
    );
    assert.equal(
      await response.webContents.executeJavaScript(
        'window.jarvisClipboard.configure({enabled:false}).then(()=>false,()=>true)',
      ),
      true,
    );
    await composer.webContents.executeJavaScript(
      "document.getElementById('clipboard-actions').querySelector('button').click();void 0;",
    );
    const preview = await composer.webContents.executeJavaScript(
      "document.getElementById('clipboard-message').value",
    );
    assert.match(preview, /Texto copiado/);
    assert.equal(sends, 0);
    await delay(100);
    fs.writeFileSync(
      path.join(directory, 'clipboard-quick.png'),
      (await composer.webContents.capturePage()).toPNG(),
    );
    await composer.webContents.executeJavaScript(
      "document.getElementById('clipboard-ignore').onclick()",
    );
    await composer.webContents.executeJavaScript('window.quick.collapse()');
    main.restore();
    main.show();
    main.focus();
    await delay(150);
    await main.webContents.executeJavaScript(
      'window.jarvisWorkspace={chat:null,project:null,canNavigate:true};void 0;',
    );
    text = 'Uma segunda cópia para o chat principal';
    await manager.tick();
    await delay(120);
    assert.equal(
      await main.webContents.executeJavaScript("document.getElementById('clipboard-card').hidden"),
      false,
    );
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-card').hidden",
      ),
      true,
    );
    assert.equal(manager.state().pending, false);
    fs.writeFileSync(
      path.join(directory, 'clipboard-main.png'),
      (await main.webContents.capturePage()).toPNG(),
    );
    await main.webContents.executeJavaScript(
      "document.getElementById('clipboard-ignore').onclick()",
    );
    // A different copy made while minimized must be claimed through real native focus.
    await main.webContents.executeJavaScript(
      "window.jarvisWorkspace.chat={id:'existing-chat'};void 0;",
    );
    main.minimize();
    await delay(100);
    text = 'Cópia com a janela principal minimizada';
    await manager.tick();
    assert.equal(manager.state().pending, true);
    main.restore();
    main.show();
    main.focus();
    await delay(160);
    assert.equal(
      await main.webContents.executeJavaScript("document.getElementById('clipboard-card').hidden"),
      false,
    );
    assert.equal(manager.state().pending, false);
    await main.webContents.executeJavaScript(
      "document.getElementById('clipboard-ignore').onclick()",
    );
    // NativeImage encoding + image rendering under Quick Chat's real CSP; no system clipboard writes.
    const pixels = Buffer.alloc(240 * 140 * 4);
    for (let y = 0; y < 140; y++)
      for (let x = 0; x < 240; x++) {
        const i = (y * 240 + x) * 4;
        pixels[i] = x < 120 ? 180 : 70;
        pixels[i + 1] = y < 70 ? 170 : 85;
        pixels[i + 2] = x < 120 ? 55 : 140;
        pixels[i + 3] = 255;
      }
    await orb.webContents.executeJavaScript('window.quick.toggle()');
    await delay(120);
    copiedImage = electron.nativeImage.createFromBitmap(pixels, { width: 240, height: 140 });
    await manager.tick();
    await composer.webContents.executeJavaScript(
      "window.dispatchEvent(new Event('focus'));void 0;",
    );
    await delay(100);
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-label').textContent",
      ),
      'Imagem copiada',
    );
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-content').hidden",
      ),
      true,
    );
    await composer.webContents.executeJavaScript(
      "document.getElementById('clipboard-title').click();void 0;",
    );
    for (
      let i = 0;
      i < 40 &&
      !(await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-image').naturalWidth",
      ));
      i++
    )
      await delay(25);
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-image').naturalWidth",
      ),
      240,
    );
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-actions').children.length",
      ),
      0,
    );
    fs.writeFileSync(
      path.join(directory, 'clipboard-image.png'),
      (await composer.webContents.capturePage()).toPNG(),
    );
    assert.equal(sends, 0);
    await composer.webContents.executeJavaScript(
      "document.getElementById('clipboard-ignore').onclick()",
    );
    assert.equal(
      await composer.webContents.executeJavaScript(
        "document.getElementById('clipboard-image').hasAttribute('src')",
      ),
      false,
    );
    await composer.webContents.executeJavaScript('window.quick.collapse()');
    main.show();
    main.focus();
    await delay(100);
    copiedImage = null;
    // Two nearly simultaneous IPC claims: focus authorization and atomic state allow one winner.
    text = 'Terceira cópia para disputa';
    await manager.tick();
    const results = await Promise.all([
      main.webContents.executeJavaScript('window.jarvisClipboard.claim()'),
      composer.webContents.executeJavaScript('window.jarvisClipboard.claim()'),
    ]);
    assert.ok(results.filter((item) => item.ok).length <= 1);
    assert.equal(Object.keys(manager.state().owned).length, 1);
    assert.equal(manager.state().pending, false);
    manager.configure({ paused: true });
    assert.deepEqual(manager.state().owned, {});
    manager.configure({ enabled: false });
    manager.destroy();
    assert.equal(manager.state().pending, false);
    assert.equal(sends, 0);
    console.log(
      'Electron real: leitura nativa Windows sem escrita, ClipboardItem/Blob assíncronos, janela minimizada, ausência de foco automático, orb, overlay API, WAV decodificado/reproduzido sem som físico, IPC, exclusividade e confirmação: OK. Alterações de conteúdo e backend sintéticos; shell visual e audição não certificados.',
    );
    console.log('Capturas de validação: ' + directory);
    finish(0);
  } catch (error) {
    finish(1, error.stack);
  }
});

// Real Electron + activation UI + DPAPI; HTTP Cloud is a local fixture, never paid.
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createCloud, parseActivation } = require('./services/cloud');
app.disableHardwareAcceleration();
let window, server;
const timer = setTimeout(() => app.exit(1), 45000);
app.whenReady().then(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-activation-smoke-'));
  try {
    let activated = false;
    server = http.createServer(async (request, response) => {
      if (request.url === '/api/activate') {
        let text = '';
        for await (const chunk of request) text += chunk;
        const body = JSON.parse(text);
        assert.equal(body.token, 'a'.repeat(43));
        activated = true;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            credential: 'b'.repeat(43),
            expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
          }),
        );
      } else if (request.url === '/api/device/session') {
        assert.equal(request.headers.authorization, 'Bearer ' + 'b'.repeat(43));
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ active: true }));
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const service = createCloud({
      safeStorage,
      dataDir: dir,
      origin: `http://localhost:${server.address().port}`,
      packaged: false,
    });
    await service.load();
    ipcMain.handle('jarvis:cloud-state', () => service.state());
    ipcMain.handle('jarvis:activate', async (event, value) => {
      assert.equal(event.sender, window.webContents);
      assert.equal(event.senderFrame, window.webContents.mainFrame);
      assert.ok(event.senderFrame.url.endsWith('/activation.html'));
      await service.activate(`jarvis://activate?token=${value}`, 'Computador de teste');
      await service.refresh();
      return { ok: true };
    });
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await window.loadFile(path.join(__dirname, 'activation.html'));
    await window.webContents.executeJavaScript(
      `document.getElementById('activation-code').value = '${'a'.repeat(43)}'; document.getElementById('activation-form').requestSubmit();`,
    );
    for (let i = 0; i < 100; i++) {
      if (
        await window.webContents.executeJavaScript(
          "document.getElementById('activation-status').textContent.includes('concluída')",
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(activated);
    assert.equal(service.state().status, 'active');
    assert.equal(await window.webContents.executeJavaScript('typeof require'), 'undefined');
    assert.equal(
      await window.webContents.executeJavaScript('typeof window.jarvisActivation.credential'),
      'undefined',
    );
    const encrypted = await fs.readFile(path.join(dir, 'cloud-credential.bin'));
    assert.ok(!encrypted.includes(Buffer.from('b'.repeat(43))));
    assert.equal(parseActivation(`jarvis://activate?token=${'a'.repeat(43)}`), 'a'.repeat(43));
    console.log(
      'Electron Cloud: tela de ativação, HTTP, autenticação individual, isolamento e safeStorage real aprovados (Cloud simulado).',
    );
    clearTimeout(timer);
    window.destroy();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
    app.exit(0);
  } catch {
    clearTimeout(timer);
    window?.destroy();
    server?.close();
    console.error('Falha no smoke de ativação Electron Cloud.');
    app.exit(1);
  }
});

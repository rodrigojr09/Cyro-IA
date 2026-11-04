const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
// Real production Electron entry + isolated FastAPI; Cloud login is a local fixture.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const net = require('node:net');
let backendPort;
const realFetch = global.fetch;
global.fetch = (input, options) =>
  realFetch(
    typeof input === 'string'
      ? input.replace('http://127.0.0.1:8765', 'http://127.0.0.1:' + backendPort)
      : input,
    options,
  );
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-session-smoke-'));
process.env.LOCALAPPDATA = directory;
delete process.env.JARVIS_DATA_DIR;
for (const key of Object.keys(process.env))
  if (key.startsWith('OPENAI_') || ['DATABASE_URL', 'DIRECT_URL', 'AUTH_SECRET'].includes(key))
    delete process.env[key];
const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
const general = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: null,
  title: 'Conversa geral',
  archived: 0,
  summary: '',
  created_at: new Date().toISOString(),
  last_message_at: null,
};
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/api/device/login' || request.url === '/api/device/session') {
    response.end(
      JSON.stringify({
        active: true,
        user: { id: '22222222-2222-4222-8222-222222222222' },
        credential: 'b'.repeat(43),
        expiresAt,
      }),
    );
  } else if (request.url === '/api/device/chats') {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const command = JSON.parse(raw);
      response.end(
        JSON.stringify(
          command.action === 'catalog'
            ? { chats: [], next: null }
            : command.action === 'fixed'
              ? { ...general, slot: 'quick', title: 'Quick Chat' }
            : command.action === 'bootstrap'
            ? { chats: [general], messages: [], until: 0, next: null, catalogNext: null }
            : command.action === 'storage'
              ? { usedBytes: 0, limitBytes: 52428800, blocked: false }
              : command.action === 'list'
                ? [general]
                : command.action === 'history'
                  ? []
                  : general,
        ),
      );
    });
  } else {
    response.statusCode = 404;
    response.end('{}');
  }
});
server.listen(0);
process.env.JARVIS_CLOUD_ORIGIN = `http://localhost:${server.address().port}`;
const root = path.resolve(DESKTOP_ROOT, '..');
let backend;
const timer = setTimeout(() => finish(1), 60000);
function finish(code) {
  clearTimeout(timer);
  server.close();
  if (backend && backend.exitCode === null) backend.kill();
  app.exit(code);
}
require('../../electron/main.cjs');
app.whenReady().then(async () => {
  try {
    // Select an ephemeral local port; never attach to a personal backend.
    const reservation = net.createServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    backendPort = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const python = fs.existsSync(path.join(root, 'backend/.venv/Scripts/python.exe'))
      ? path.join(root, 'backend/.venv/Scripts/python.exe')
      : 'python';
    const script =
      'import os;from pathlib import Path;import main,uvicorn;main.ROOT=Path(os.environ["LOCALAPPDATA"]);main.DB=main.ROOT/"unused.sqlite3";uvicorn.run(main.app,host="127.0.0.1",port=int(os.environ["JARVIS_SMOKE_PORT"]),log_level="error")';
    const backendEnv = {
      ...process.env,
      JARVIS_CLOUD: '1',
      JARVIS_SMOKE_PORT: String(backendPort),
    };
    delete backendEnv.JARVIS_DATA_DIR;
    backend = spawn(python, ['-c', script], {
      cwd: path.join(root, 'backend'),
      env: backendEnv,
      windowsHide: true,
      stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (backend.exitCode !== null) throw Error('Backend de teste encerrou');
      try {
        if ((await fetch('http://127.0.0.1:8765/health')).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const window = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().endsWith('/login.html'),
    );
    assert.ok(window);
    await window.webContents.executeJavaScript(
      `document.getElementById('login-email').value='test@example.test';document.getElementById('login-password').value='password-for-test-only';document.getElementById('login-form').requestSubmit();`,
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        window.webContents.getURL().endsWith('/index.html') &&
        BrowserWindow.getAllWindows().every((win) => !win.webContents.isLoading())
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(window.webContents.getURL().endsWith('/index.html'), await window.webContents.executeJavaScript('document.body.innerText'));
    const workspace = await window.webContents.executeJavaScript(
      "window.jarvisWindow.api('/workspace')",
    );
    assert.equal(workspace.ok, true);
    assert.equal(process.env.JARVIS_DATA_DIR, path.join(directory, 'JARVIS'));
    assert.ok(fs.existsSync(path.join(directory, 'JARVIS/.local-token')));
    assert.ok(fs.existsSync(path.join(directory, 'JARVIS/cloud-session-v4.bin')));
    assert.equal(BrowserWindow.getAllWindows().length, 4);
    const composer = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes('panel=composer'),
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await composer.webContents.executeJavaScript('window.quick.state()')).ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(
      (await composer.webContents.executeJavaScript('window.quick.state()')).ready,
      true,
    );
    app.emit('jarvis:session-changed', true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(
      (await composer.webContents.executeJavaScript('window.quick.state()')).ready,
      true,
    );
    assert.equal(
      await composer.webContents.executeJavaScript("document.getElementById('question').disabled"),
      false,
    );
    assert.equal(
      await window.webContents.executeJavaScript("document.getElementById('status').textContent"),
      'Conectado',
    );

    console.log(
      'Electron + FastAPI reais: login, publicação da sessão, workspace e Quick Chat aprovados (Cloud simulado, perfil temporário).',
    );
    finish(0);
  } catch (error) {
    console.error('Falha na integração Electron/FastAPI:', error.stack || error.name);
    finish(1);
  }
});

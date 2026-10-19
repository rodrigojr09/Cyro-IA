const { app, BrowserWindow, ipcMain } = require('electron');
app.disableHardwareAcceleration();
const path = require('path');
const fs = require('fs/promises');
const { pathToFileURL } = require('url');
const pageURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const routes = new Map([
    ['/health', 'GET'], ['/history', 'GET'], ['/chat', 'POST'], ['/speak', 'POST'],
    ['/action/open', 'POST'], ['/action/folder', 'POST'], ['/action/confirm', 'POST'],
    ['/computer/processes', 'GET'], ['/computer/system', 'GET']
]);
let win;
function createWindow() {
    win = new BrowserWindow({
        width: 390, height: 540, minWidth: 320, minHeight: 390,
        frame: false, alwaysOnTop: true, resizable: true,
        backgroundColor: '#0a1020',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => {
    ipcMain.handle('jarvis:api', async (event, route, options = {}) => {
        if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame ||
            event.senderFrame.url !== pageURL || !routes.has(route)) {
            throw new Error('Solicitação não autorizada.');
        }
        const method = routes.get(route);
        if (options.method && options.method !== method) throw new Error('Método não permitido.');
        if (options.body !== undefined && (typeof options.body !== 'string' || options.body.length > 30000)) {
            throw new Error('Conteúdo inválido.');
        }
        try {
            const token = (await fs.readFile(path.join(__dirname, '..', 'backend', '.local-token'), 'utf8')).trim();
            const response = await fetch('http://127.0.0.1:8765' + route, {
                method, headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': token },
                body: method === 'POST' ? options.body : undefined,
                redirect: 'error', signal: AbortSignal.timeout(120000)
            });
            const data = await response.json();
            return { ok: response.ok, data };
        } catch {
            throw new Error('Backend indisponível. Inicie ou reinicie o Python.');
        }
    });
    ipcMain.on('window:minimize', () => win?.minimize());
    ipcMain.on('window:close', () => win?.close());
    createWindow();
});
app.on('window-all-closed', () => {
    console.log("Todas as janelas foram fechadas.");
    app.quit()
});

process.on("uncaughtException", (error) => {
    console.error("ERRO JARVIS:", error);
});

app.on("before-quit", () => {
    console.log("JARVIS está encerrando...");
});

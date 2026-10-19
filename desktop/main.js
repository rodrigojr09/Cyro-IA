const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
app.disableHardwareAcceleration();
const path = require('path');
const fs = require('fs/promises');
const { pathToFileURL } = require('url');
const pageURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const routes = new Map([
    ['/health', 'GET'], ['/history', 'GET'], ['/chat', 'POST'], ['/speak', 'POST'],
    ['/action/open', 'POST'], ['/action/folder', 'POST'], ['/action/confirm', 'POST'],
    ['/computer/processes', 'GET'], ['/computer/system', 'GET'],
    ['/programming/status', 'GET'], ['/programming/revoke', 'POST']
]);
let win;
function trusted(event) {
    return event.sender === win?.webContents && event.senderFrame === win.webContents.mainFrame &&
        event.senderFrame.url === pageURL;
}
async function backend(route, method, body) {
    try {
        const token = (await fs.readFile(path.join(__dirname, '..', 'backend', '.local-token'), 'utf8')).trim();
        const response = await fetch('http://127.0.0.1:8765' + route, {
            method, headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': token },
            body: method === 'POST' ? body : undefined,
            redirect: 'error', signal: AbortSignal.timeout(180000)
        });
        return { ok: response.ok, data: await response.json() };
    } catch {
        throw new Error('Backend indisponível. Inicie ou reinicie o Python.');
    }
}
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
    ipcMain.handle('jarvis:authorize-folder', async event => {
        if (!trusted(event)) throw new Error('Solicitação não autorizada.');
        const selected = await dialog.showOpenDialog(win, {
            title: 'Autorizar leitura de código nesta pasta — nenhum arquivo será alterado',
            buttonLabel: 'Selecionar pasta', properties: ['openDirectory']
        });
        if (selected.canceled || selected.filePaths.length !== 1) return { canceled: true };
        const selectedPath = selected.filePaths[0];
        const confirmation = await dialog.showMessageBox(win, {
            type: 'question', title: 'Autorizar análise somente leitura',
            message: 'Permitir que o JARVIS leia código nesta pasta e nas subpastas?',
            detail: selectedPath + '\nTrechos consultados pelo chat serão enviados à OpenAI. Arquivos protegidos serão bloqueados.',
            buttons: ['Cancelar', 'Autorizar leitura'], defaultId: 0, cancelId: 0, noLink: true
        });
        if (confirmation.response !== 1) return { canceled: true };
        return backend('/programming/authorize', 'POST', JSON.stringify({ path: selectedPath }));
    });
    ipcMain.handle('jarvis:copy-code', (event, text) => {
        if (!trusted(event) || typeof text !== 'string' || text.length > 100000) {
            throw new Error('Cópia não permitida.');
        }
        clipboard.writeText(text);
        return true;
    });
    ipcMain.handle('jarvis:api', async (event, route, options = {}) => {
        if (!trusted(event) || !routes.has(route)) {
            throw new Error('Solicitação não autorizada.');
        }
        const method = routes.get(route);
        if (options.method && options.method !== method) throw new Error('Método não permitido.');
        if (options.body !== undefined && (typeof options.body !== 'string' || options.body.length > 30000)) {
            throw new Error('Conteúdo inválido.');
        }
        return backend(route, method, options.body);
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

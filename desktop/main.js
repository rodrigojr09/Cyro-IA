const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, screen } = require('electron');
const ownsInstance=app.requestSingleInstanceLock();
if(!ownsInstance || (process.argv||[]).includes('--jarvis-probe')){
    app.exit(ownsInstance?0:73);
}else{
app.disableHardwareAcceleration();
const path = require('path');
const fs = require('fs/promises');
const { pathToFileURL } = require('url');
const pageURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const dataDir = process.env.JARVIS_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'), 'JARVIS');
if (!path.isAbsolute(dataDir)) throw new Error('JARVIS_DATA_DIR deve ser um caminho absoluto.');
const routes = new Map([
    ['/health', 'GET'], ['/history', 'GET'], ['/chat', 'POST'], ['/speak', 'POST'],
    ['/action/open', 'POST'], ['/action/folder', 'POST'], ['/action/confirm', 'POST'],
    ['/computer/processes', 'GET'], ['/computer/system', 'GET'],
    ['/programming/status', 'GET'], ['/programming/revoke', 'POST'],
    ['/workspace', 'GET'], ['/workspace/view', 'POST'], ['/chats/history', 'GET'],
    ['/chats/create', 'POST'], ['/projects/refresh', 'POST'], ['/projects/accept-partial', 'POST'],
    ['/projects/knowledge', 'GET'], ['/projects/note', 'POST'],
    ['/projects/selection', 'GET'], ['/projects/selection/save', 'POST']
]);
let win,quickController,quitting=false;
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
function trusted(event) {
    return event.sender === win?.webContents && event.senderFrame === win.webContents.mainFrame &&
        event.senderFrame.url === pageURL;
}
async function backend(route, method, body) {
    try {
        const token = (await fs.readFile(path.join(dataDir, '.local-token'), 'utf8')).trim();
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
const windowState = require('./window-state');
const stateFile = path.join(dataDir, 'window-state.json');
function createWindow() {
    const saved = windowState.load(stateFile, screen?.getAllDisplays?.() || []);
    win = new BrowserWindow({
        width: 1280, height: 850, ...(saved?.bounds || {}), minWidth: 800, minHeight: 560,
        frame: true, autoHideMenuBar: true, alwaysOnTop: false, resizable: true, fullscreenable: true,
        backgroundColor: '#0D1117',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on?.('close', event => {windowState.save(stateFile, win);if(!quitting&&quickController?.hideOnClose()){event.preventDefault();win.hide();}else if(!quitting){event.preventDefault();quitJarvis();}});
    win.webContents.on('before-input-event', (event, input) => {
        if(input.type==='keyDown' && input.key==='F11' && !input.isAutoRepeat){event.preventDefault();win.setFullScreen(!win.isFullScreen());}
    });
    if (!saved || saved.maximized) win.maximize?.();
    if (saved?.fullscreen) win.setFullScreen?.(true);
    win.loadFile(path.join(__dirname, 'index.html'));
}
function showMain(chatId){if(win){if(win.isMinimized())win.restore();win.show();win.focus();if(chatId)win.webContents.send('jarvis:open-chat',chatId);}}
function quitJarvis(){quitting=true;app.quit();}
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
            detail: selectedPath + '\nPrimeiro você escolherá os arquivos e pastas usados na análise, sem consumo de tokens. A OpenAI será usada somente após confirmar a seleção. A pasta original não será modificada.',
            buttons: ['Cancelar', 'Autorizar leitura'], defaultId: 0, cancelId: 0, noLink: true
        });
        if (confirmation.response !== 1) return { canceled: true };
        return backend('/projects/register', 'POST', JSON.stringify({ path: selectedPath }));
    });
    ipcMain.handle('jarvis:remove-project', async (event, projectId) => {
        if (!trusted(event) || !/^[a-f0-9-]{36}$/i.test(projectId)) throw new Error('Projeto inválido.');
        const result = await dialog.showMessageBox(win, {
            type: 'warning', title: 'Remover projeto do JARVIS',
            message: 'A pasta original será preservada. O que deseja remover?',
            detail: 'Manter memória permite recuperar os chats ao cadastrar a mesma pasta novamente. Apagar memória remove os chats e o conhecimento internos deste projeto.',
            buttons: ['Cancelar', 'Somente cadastro; manter memória', 'Cadastro e memória interna'], defaultId: 0, cancelId: 0, noLink: true
        });
        if (result.response === 0) return { canceled: true };
        return backend('/projects/remove','POST',JSON.stringify({project_id:projectId,delete_memory:result.response===2,confirmed:true}));
    });
    ipcMain.handle('jarvis:manage-chat', async (event, chatId, action, title) => {
        if (!trusted(event) || !/^[a-f0-9-]{36}$/i.test(chatId) || !['rename','archive','restore','delete'].includes(action)) throw new Error('Conversa inválida.');
        const body = {chat_id:chatId};
        if (action === 'rename') {
            if (typeof title !== 'string' || !title.trim() || title.length > 120) throw new Error('Título inválido.');
            body.title = title;
        } else if (action === 'restore') body.archived = false;
        else {
            const result = await dialog.showMessageBox(win, {type:'warning', title:'Gerenciar conversa',
                message:action === 'delete' ? 'Excluir permanentemente esta conversa e seu histórico interno?' : 'Arquivar esta conversa?',
                buttons:['Cancelar','Confirmar'],defaultId:0,cancelId:0,noLink:true});
            if (result.response !== 1) return {canceled:true};
            body.confirmed = true;
            if (action === 'delete') body.delete = true;
            else body.archived = true;
        }
        return backend('/chats/change','POST',JSON.stringify(body));
    });
    ipcMain.handle('jarvis:open-link', async(event, value) => {
        if(!trusted(event) || typeof value!=='string' || value.length>2048) throw new Error('Link inválido.');
        let target;try{target=new URL(value);}catch{throw new Error('Link inválido.');}
        if(!['https:','http:'].includes(target.protocol) || target.username || target.password) throw new Error('Link bloqueado.');
        const decision=await dialog.showMessageBox(win,{type:'question',message:'Abrir link no navegador?',detail:target.href,buttons:['Cancelar','Abrir'],defaultId:0,cancelId:0,noLink:true});
        if(decision.response===1)await shell.openExternal(target.href);
    });
    ipcMain.handle('jarvis:copy-code', (event, text) => {
        if (!trusted(event) || typeof text !== 'string' || text.length > 100000) {
            throw new Error('Cópia não permitida.');
        }
        clipboard.writeText(text);
        return true;
    });
    ipcMain.handle('jarvis:api', async (event, route, options = {}) => {
        if (typeof route !== 'string' || route.length > 1024) throw new Error('Rota inválida.');
        const baseRoute = route.split('?')[0];
        if (!trusted(event) || !routes.has(baseRoute) || (route.includes('?') && !['/chats/history','/projects/knowledge','/projects/selection'].includes(baseRoute))) {
            throw new Error('Solicitação não autorizada.');
        }
        const method = routes.get(baseRoute);
        if (options.method && options.method !== method) throw new Error('Método não permitido.');
        if (options.body !== undefined && (typeof options.body !== 'string' || options.body.length > 30000)) {
            throw new Error('Conteúdo inválido.');
        }
        const result=await backend(route, method, options.body);
        if(baseRoute==='/workspace/view'&&result.ok)quickController?.setProject(result.data.project);
        return result;
    });
    ipcMain.on('window:minimize', event => {if(trusted(event))win.minimize();});
    ipcMain.on('window:close', event => {if(trusted(event))win.close();});
    ipcMain.handle('jarvis:quick-settings',event=>{if(!trusted(event))throw Error('Solicitação não autorizada.');return quickController.getSettings();});
    ipcMain.handle('jarvis:quick-configure',(event,value)=>{if(!trusted(event))throw Error('Solicitação não autorizada.');return quickController.setSettings(value);});
    ipcMain.handle('jarvis:voice-preference',(event,value)=>{if(!trusted(event)||typeof value!=='boolean')throw Error('Solicitação não autorizada.');quickController?.setMasterVoice(value);});
    ipcMain.handle('jarvis:audio-claim',event=>{if(!trusted(event))throw Error('Solicitação não autorizada.');quickController?.claimAudio(event.sender);});
    createWindow();
    quickController=require('./quick-controller').createQuick({electron:require('electron'),backend,dataDir,mainWindow:()=>win,openMain:showMain,quit:quitJarvis});
});
app.on('window-all-closed', () => {
    console.log("Todas as janelas foram fechadas.");
    if(quitting)app.quit()
});

process.on("uncaughtException", (error) => {
    console.error("ERRO JARVIS:", error);
});

app.on("before-quit", () => {
    quitting=true;quickController?.destroy();
    console.log("JARVIS está encerrando...");
});

}

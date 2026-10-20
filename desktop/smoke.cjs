// Electron real com preload, navegação e dados fictícios; não usa a API externa.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
app.disableHardwareAcceleration();
app.setPath('userData',require('node:fs').mkdtempSync(path.join(app.getPath('temp'),'jarvis-smoke-')));
let win,copied,speech,submittedChat,savedScope;
const projectId='11111111-1111-4111-8111-111111111111',generalId='22222222-2222-4222-8222-222222222222',firstId='33333333-3333-4333-8333-333333333333',secondId='44444444-4444-4444-8444-444444444444';
const project={id:projectId,name:'iPet',path:'C:\\Fixtures\\iPet',ready:1,state:'ready',scope_confirmed:1,knowledge_version:2,progress:'Memória atualizada'};
const chats=[{id:firstId,project_id:projectId,title:'Investigando a autenticação',archived:0},{id:secondId,project_id:projectId,title:'Melhorias no feed',archived:0},{id:generalId,project_id:null,title:'Ideias para a semana',archived:0}];
const reply='## Uma sessão segura começa no backend\n\nO fluxo de autenticação deve validar o token antes de carregar os dados do usuário.\n\n1. Confira a validade da sessão.\n2. Trate a resposta de acesso negado.\n\n| Camada | Responsabilidade |\n| --- | --- |\n| Backend | Validar sessão e permissões |\n| Frontend | Exibir estado de autenticação |\n\n```ts\nexport async function getCurrentUser() {\n  const response = await fetch("/api/me");\n  if (!response.ok) throw new Error("Sessão inválida");\n  return response.json();\n}\n```\n\n**Hipótese:** investigue o tratamento de expiração no arquivo `backend/index.ts:2`. Aplique o exemplo manualmente. Nenhum arquivo foi alterado.';
const timer=setTimeout(()=>{console.error('Tempo de teste excedido');app.exit(1);},45000);
ipcMain.handle('jarvis:voice-preference',()=>{});
ipcMain.handle('jarvis:audio-claim',()=>{});
ipcMain.handle('jarvis:quick-settings',()=>({opacity:.82,wpm:200,minSeconds:5,maxSeconds:30,voice:false,closeToTray:true}));
ipcMain.handle('jarvis:quick-configure',(_,value)=>value);
ipcMain.handle('jarvis:copy-code',(_,text)=>{copied=text;return true;});
ipcMain.handle('jarvis:open-link',()=>true);
ipcMain.handle('jarvis:api',(_,route,options)=>{
 let data;
 if(route==='/health')data={ok:true};
 else if(route==='/workspace')data={projects:[project],chats,general_chat_id:generalId};
 else if(route==='/workspace/view')data=JSON.parse(options.body).project_id?{project,chats:chats.filter(c=>c.project_id),archived_chats:[]}:{project:null,chats:chats.filter(c=>!c.project_id),archived_chats:[]};
 else if(route.startsWith('/chats/history?')){const id=new URLSearchParams(route.split('?')[1]).get('chat_id');data={chat:chats.find(c=>c.id===id),messages:id===secondId?[{id:1,role:'user',content:'Assunto independente do feed'}]:[]};}
 else if(route==='/chats/create'){data={id:'55555555-5555-4555-8555-555555555555',project_id:JSON.parse(options.body).project_id,title:'Nova conversa',archived:0};chats.push(data);}
 else if(route==='/programming/status')data={progress:'Pronto',project:null,roots:[]};
 else if(route==='/chat'){submittedChat=JSON.parse(options.body).chat_id;data={reply,speech_text:'Revise a validade da sessão. O exemplo está no chat.',pending_actions:[]};}
 else if(route==='/speak'){speech=JSON.parse(options.body).message;return {ok:false,data:{detail:'Voz simulada no teste'}};}
 else if(route.startsWith('/projects/selection?'))data={selection:{confirmed:true,include:['.'],exclude:[]},next_offset:null,entries:[{name:'src',path:'src',type:'directory'},{name:'package-lock.json',path:'package-lock.json',type:'file',disabled:true,reason:'Lock ignorado'},{name:'dist',path:'dist',type:'directory',disabled:true,reason:'Build ignorado'}]};
 else if(route==='/projects/selection/save'){savedScope=JSON.parse(options.body);data={...project,selection_changed:true};}
 else throw new Error('Rota inesperada: '+route);
 return {ok:true,data};
});
const js=code=>win.webContents.executeJavaScript(code);
async function frame(){await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');}
async function shot(name){await frame();await fs.writeFile(path.join(app.getPath('temp'),name),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 try{
 win=new BrowserWindow({width:1280,height:850,minWidth:800,minHeight:560,show:false,frame:true,alwaysOnTop:false,resizable:true,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
 await win.loadFile(path.join(__dirname,'index.html'));
 await js(`new Promise(resolve=>{const poll=()=>document.getElementById('status').textContent==='Conectado'?resolve():setTimeout(poll,20);poll();})`);
 assert.equal(await js(`document.querySelectorAll('#sidebar select').length`),0);
 assert.equal(await js(`document.getElementById('welcome').hidden`),false);
 await shot('jarvis-v06-home.png');
 await js(`document.querySelector('.project-item').onclick()`);
 await js(`document.querySelector('.chat-item[title="Investigando a autenticação"]').onclick()`);
 await js(`(async()=>{document.getElementById('input').value='Como melhorar o fluxo de login?';await document.getElementById('send').onclick();await document.querySelector('.code-block button').onclick();})()`);
 assert.equal(submittedChat,firstId);assert.match(copied,/export async function/);assert.match(speech,/validade da sessão/);
 assert.equal(await js(`document.querySelectorAll('#messages table').length`),1);
 assert.ok(await js(`document.querySelectorAll('#messages .hljs-keyword').length`)>0);
 assert.equal(await js(`document.querySelectorAll('#messages script').length`),0);
 await shot('jarvis-v06-chat.png');
 await js(`document.querySelector('.chat-item[title="Melhorias no feed"]').onclick()`);
 assert.match(await js(`document.getElementById('messages').textContent`),/Assunto independente/);
 assert.equal(await js(`document.querySelectorAll('#messages pre').length`),0);
 await js(`document.getElementById('new-chat').onclick()`);
 assert.equal(await js(`window.jarvisWorkspace.chat.id`),'55555555-5555-4555-8555-555555555555');
 await js(`(async()=>{await window.jarvisScope.open(window.jarvisWorkspace.project);})()`);
 assert.equal(await js(`document.querySelectorAll('#scope-list input:disabled').length`),2);
 await js(`(async()=>{document.getElementById('scope-none').onclick();await document.getElementById('scope-save').onclick();})()`);
 assert.deepEqual(savedScope.include,[]);
 await js(`document.getElementById('settings-open').click()`);await shot('jarvis-v06-settings.png');await js(`document.getElementById('settings-dialog').close()`);
 win.setSize(800,600);await frame();
 assert.equal(await js(`document.body.scrollWidth<=innerWidth`),true);
 await js(`document.getElementById('sidebar-toggle').click()`);assert.equal(await js(`document.body.classList.contains('sidebar-collapsed')`),true);
 console.log('Electron real: sidebar, chats isolados, envio, Markdown, código/cópia, áudio resumido, seleção, configurações e redimensionamento aprovados. Capturas: jarvis-v06-home.png, jarvis-v06-chat.png, jarvis-v06-settings.png no diretório temporário.');
 clearTimeout(timer);win.destroy();app.exit(0);
 }catch(error){console.error(error.stack);clearTimeout(timer);win?.destroy();app.exit(1);}
});

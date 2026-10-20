const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const core=require('./quick-core'),{createQuick}=require('./quick-controller');
function fixture(directory,backend){
 let now=0,tick,opened=[],quit=0;
 const handlers=new Map(),requests=[];
 class Contents extends EventEmitter{constructor(){super();this.mainFrame={url:''};this.events=[];}send(name,data){this.events.push({name,data});}setWindowOpenHandler(fn){this.windowOpen=fn;}}
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.webContents=new Contents();this.visible=false;this.destroyed=false;}
  setAlwaysOnTop(value){this.top=value;}setVisibleOnAllWorkspaces(){}setShape(shape){this.shape=shape;}
  loadFile(file,options){this.webContents.mainFrame.url=pathToFileURL(file).href+'?panel='+options.query.panel;}
  setBounds(bounds){this.bounds=bounds;}show(){this.visible=true;}showInactive(){this.visible=true;}hide(){this.visible=false;}focus(){this.focused=true;}
  isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}
 }
 class Tray{setToolTip(){}setContextMenu(menu){this.menu=menu;}on(){}destroy(){this.destroyed=true;}}
 const screen=new EventEmitter();screen.displays=[{id:1,workArea:{x:0,y:0,width:1280,height:800}},{id:2,workArea:{x:-1280,y:0,width:1280,height:800}}];screen.getAllDisplays=()=>screen.displays;screen.getPrimaryDisplay=()=>screen.displays[0];
 const main=new Window({});main.minimized=true;
 const controller=createQuick({electron:{BrowserWindow:Window,screen,ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)},Tray,Menu:{buildFromTemplate:x=>x},nativeImage:{createFromBitmap:()=>({})},clipboard:{writeText(){}}},backend:async(...args)=>{requests.push(args);return backend?backend(...args):{ok:true,data:args[0]==='/quick/session'?{chat_id:'quick-id'}:args[0]==='/speak'?{audio_base64:'bXAz'}:{reply:'Resposta curta de teste.'}};},dataDir:directory,mainWindow:()=>main,openMain:id=>opened.push(id),quit:()=>quit++,now:()=>now,schedule:fn=>{tick=fn;return 1;},cancel:()=>{}});
 const invoke=(role,name,...args)=>{const webContents=controller.windows[role].webContents;return handlers.get('quick:'+name)({sender:webContents,senderFrame:webContents.mainFrame},...args);};
 return {controller,invoke,handlers,requests,main,screen,opened,advance(ms){now+=ms;tick();}};
}
function temporary(fn){return async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-quick-'));let instance;try{instance=fixture(dir);await fn(instance,dir);}finally{instance?.controller.destroy();fs.rmSync(dir,{recursive:true,force:true});}};}

test('tempo de leitura usa 200 ppm, mínimo, máximo e configurações validadas',()=>{
 assert.equal(core.duration('Olá'),5000);assert.equal(core.duration('palavra '.repeat(40)),15000);assert.equal(core.duration('palavra '.repeat(300)),30000);
 assert.equal(core.duration('palavra '.repeat(40),core.settings({wpm:400,minSeconds:3,maxSeconds:60})),9000);
 assert.throws(()=>core.settings({opacity:.2}));assert.throws(()=>core.settings({wpm:0}));assert.throws(()=>core.settings({minSeconds:50,maxSeconds:5}));assert.throws(()=>core.settings({secret:'no'}));
});
test('relógio pausa com múltiplos motivos, fixa e reinicia com nova resposta',()=>{
 let now=0;const clock=new core.Clock(()=>now);clock.reset(5000);now=1000;assert.equal(clock.tick(),4000);clock.pause('hover',true);now=5000;assert.equal(clock.tick(),4000);clock.pause('pin',true);clock.pause('hover',false);now=10000;assert.equal(clock.tick(),4000);clock.pause('pin',false);now=12000;assert.equal(clock.tick(),2000);clock.reset(7000);assert.equal(clock.tick(),7000);
});
test('geometria considera monitores negativos, bordas e resposta acima do campo',()=>{
 const area={x:-1920,y:-100,width:1920,height:1000};
 assert.deepEqual(core.clamp({x:-3000,y:2000},area),{x:-1920,y:858});
 for(const point of [{x:-1910,y:-90},{x:-60,y:800}]){const b=core.panels(point,area,320);assert.ok(b.response.y>=area.y);assert.ok(b.response.y+b.response.height<b.input.y);assert.ok(b.input.x>=area.x);assert.ok(b.input.x+b.input.width<=area.x+area.width);assert.ok(b.input.y+b.input.height<=area.y+area.height);assert.ok(b.input.x+b.input.width<=point.x||b.input.x>=point.x+core.ICON_SIZE);}
 const shape=core.circle();assert.equal(shape.length,42);assert.ok(shape[0].x>0);assert.equal(shape[21].x,1);
});
test('ícone é independente, continua visível com principal minimizada e IPC é restrito',temporary(async f=>{
 const {orb,composer,response}=f.controller.windows;orb.emit('ready-to-show');assert.equal(orb.visible,true);assert.equal(f.main.minimized,true);
 for(const window of [orb,composer,response]){assert.equal(window.options.parent,undefined);assert.equal(window.options.skipTaskbar,true);assert.equal(window.options.webPreferences.nodeIntegration,false);assert.equal(window.options.webPreferences.contextIsolation,true);}
 assert.throws(()=>f.invoke('orb','send','texto',false));assert.throws(()=>f.invoke('orb','move',NaN,0,true));
 const fn=f.handlers.get('quick:state');assert.throws(()=>fn({sender:{},senderFrame:{}}));
 f.invoke('orb','toggle');assert.equal(composer.visible,true);assert.equal(composer.focused,true);f.invoke('composer','collapse');assert.equal(composer.visible,false);assert.equal(orb.visible,true);
}));
test('posição e preferências persistem, e monitor removido recoloca o ícone',temporary(async(f,dir)=>{
 f.invoke('orb','move',-1200,300,true);f.controller.setSettings({wpm:250,voice:true,closeToTray:false});f.controller.destroy();
 const second=fixture(dir);try{assert.equal(second.controller.getSettings().wpm,250);assert.equal(second.controller.windows.orb.bounds.x,-1200);second.screen.displays=[second.screen.displays[0]];second.screen.emit('display-removed');assert.ok(second.controller.windows.orb.bounds.x>=0);}finally{second.controller.destroy();}
}));
test('resposta não restaura principal, temporizador pausa com hover, seleção e fixação',temporary(async f=>{
 f.invoke('orb','toggle');await f.invoke('composer','send','Olá',false);assert.equal(f.opened.length,0);assert.equal(f.controller.windows.response.visible,true);
 f.invoke('response','pause','hover',true);f.advance(40000);assert.equal(f.controller.windows.response.visible,true);
 await f.invoke('composer','send','Nova resposta com mouse sobre o painel',false);f.advance(40000);assert.equal(f.controller.windows.response.visible,true);
 f.invoke('response','pause','selection',true);f.invoke('response','pause','hover',false);f.advance(40000);assert.equal(f.controller.windows.response.visible,true);
 f.invoke('response','pin',true);f.invoke('response','pause','selection',false);f.advance(40000);assert.equal(f.controller.windows.response.visible,true);
 f.invoke('response','pin',false);f.advance(40000);assert.equal(f.controller.windows.response.visible,false);assert.equal(f.controller.windows.composer.visible,true);
 await f.invoke('response','open-main');assert.deepEqual(f.opened,['quick-id']);
}));
test('fechar campo durante geração mantém requisição e resposta sem mostrar janela principal',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-quick-'));let resolve;const f=fixture(dir,()=>new Promise(done=>{resolve=done;}));
 try{f.invoke('orb','toggle');const pending=f.invoke('composer','send','Pergunta',false);f.advance(90000);assert.equal(f.invoke('orb','state').busy,true);f.invoke('composer','collapse');resolve({ok:true,data:{reply:'Resposta preservada'}});await pending;assert.equal(f.invoke('orb','state').answer,'Resposta preservada');assert.equal(f.controller.windows.response.visible,false);assert.equal(f.opened.length,0);}finally{f.controller.destroy();fs.rmSync(dir,{recursive:true,force:true});}
});
test('projeto é opt-in, não vem de caminho livre, e falha preserva pergunta',temporary(async f=>{
 f.controller.setProject({id:'project-id',name:'Projeto'});f.invoke('orb','toggle');await f.invoke('composer','send','Geral',false);assert.equal(JSON.parse(f.requests.at(-1)[2]).project_id,null);
 await f.invoke('composer','send','Analise o projeto',true);assert.equal(JSON.parse(f.requests.at(-1)[2]).project_id,'project-id');
 f.controller.setProject(null);await assert.rejects(f.invoke('composer','send','Projeto',true));
}));
test('erro temporário mantém pergunta e permite nova tentativa',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-quick-'));let fail=true;const f=fixture(dir,async()=>{if(fail)throw Error('offline');return {ok:true,data:{reply:'Conectado'}};});
 try{f.invoke('orb','toggle');const first=await f.invoke('composer','send','Mantenha esta pergunta',false);assert.equal(first.ok,false);assert.equal(f.invoke('orb','state').question,'Mantenha esta pergunta');fail=false;assert.equal((await f.invoke('composer','send','Mantenha esta pergunta',false)).ok,true);}finally{f.controller.destroy();fs.rmSync(dir,{recursive:true,force:true});}
});
test('voz do Quick Chat pausa o tempo e cede a reprodução à janela principal',temporary(async f=>{
 f.invoke('orb','toggle');await f.invoke('composer','send','Resumo',false);f.controller.setSettings({voice:true});await f.invoke('response','speak');
 assert.ok(f.main.webContents.events.some(event=>event.name==='jarvis:stop-audio'));
 f.advance(90000);assert.equal(f.controller.windows.response.visible,true);
 f.controller.claimAudio(f.main.webContents);assert.equal(f.invoke('orb','state').voicing,false);
 assert.ok(f.controller.windows.response.webContents.events.some(event=>event.name==='jarvis:stop-audio'));
 f.controller.setMasterVoice(false);const before=f.requests.length;await f.invoke('response','speak');assert.equal(f.requests.length,before);
}));

test('abrir o ícone mostra só o compositor, preserva histórico e pausa ao passar sobre o campo',temporary(async f=>{
 f.invoke('orb','toggle');assert.equal(f.requests.length,0);assert.equal(f.controller.windows.orb.bounds.width,42);
 await f.invoke('composer','send','Uma pergunta',false);assert.equal(f.controller.windows.response.visible,true);
 f.invoke('composer','pause','hover',true);f.advance(50000);assert.equal(f.controller.windows.response.visible,true);assert.equal(f.invoke('orb','state').hovered,true);
 f.invoke('composer','collapse');const calls=f.requests.length;f.invoke('orb','toggle');assert.equal(f.requests.length,calls);assert.equal(f.controller.windows.composer.visible,true);assert.equal(f.controller.windows.response.visible,false);assert.equal(f.invoke('orb','state').answer,'Resposta curta de teste.');
}));

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {environment,input,click,settle,act}=require('../helpers/react.cjs');
function fixture(initial){
 let state=structuredClone(initial),calls=[];let count=0;
 const request=async c=>{calls.push(c);if(c.action==='workbench.list')return structuredClone(state);if(c.action==='tables.list')return {tables:[]};if(c.action==='files.list')return {files:[]};
 if(c.action==='workbench.write'){const old=state.files.find(f=>f.name===c.name);const value={name:c.name,content:c.content,revision:(old?.revision||0)+1};state.files=state.files.filter(f=>f.name!==c.name).concat(value);state.revision++;state.panel={kind:'code',target:c.name,source:'workbench',token:String(++count)};}
 if(c.action==='workbench.table'){const old=state.tables.find(t=>t.name===c.name);state.tables=state.tables.filter(t=>t.name!==c.name).concat({name:c.name,columns:c.columns,rows:c.rows,revision:(old?.revision||0)+1});state.revision++;state.panel={kind:'table',target:c.name,source:'workbench',token:String(++count)};}
 if(c.action==='workbench.runFile'){state.revision++;state.executions.push({id:'run-id',runtime:'python',source:'exec(open("main.py").read())',files:state.files,createdAt:'2026-11-19T12:00:00Z'});state.panel={kind:'preview',target:'run-id',source:'workbench',token:String(++count)};}
 return structuredClone(state);};
 return {request,calls,get:()=>state,execute:async value=>{assert.deepEqual(value,{projectId:'space',requestId:'run-id'});const result={output:'42',exitCode:0};state.executions[0].result=result;return result;}};
}
const empty={revision:0,files:[],tables:[],executions:[]};
test('the Studio restores a previous code version from its toolbar', async () => {
  const env = environment();
  const panel = {kind: 'code', source: 'workbench', target: 'main.py', token: 'open'};
  const state = {...empty, revision: 2, files: [{name: 'main.py', content: 'new', revision: 2}], panel};
  const store = fixture(state);
  window.cyroEV = {draft: async () => null};
  try {
    await env.mount(env.EVStudio, {projectId: 'space', hidden: false, visible: true, request: async command => {
      if (command.action === 'workbench.versions') return {versions: [{version: 1}]};
      if (command.action === 'workbench.rollback') {
        assert.equal(command.name, 'main.py');
        assert.equal(command.version, 1);
        return {...state, revision: 3, files: [{name: 'main.py', content: 'old', revision: 3}],
          panel: {...panel, token: 'restored'}};
      }
      return store.request(command);
    }});
    await settle();
    await click('[aria-label="Histórico de versões"]');
    await click('[aria-label="Versões anteriores"] button');
    await settle();
    assert.equal(document.querySelector('textarea[aria-label="Editor de código"]').value, 'old');
  } finally {
    await env.dispose();
  }
});
test('an open Studio refreshes saved code and protects unsaved edits', async () => {
  const env = environment();
  const store = fixture({
    ...empty,
    files: [{name: 'main.py', content: 'original', revision: 1}],
    panel: {kind: 'code', source: 'workbench', target: 'main.py', token: 'open'},
  });
  window.cyroEV = {draft: async () => null};
  const sync = () => act(async () => window.dispatchEvent(new window.Event('focus')));
  const editor = 'textarea[aria-label="Editor de código"]';
  try {
    await env.mount(env.EVStudio, {projectId: 'space', hidden: false, visible: true, request: store.request});
    await settle();
    const remote = store.get();
    remote.files[0] = {name: 'main.py', content: 'saved from chat', revision: 2};
    remote.revision++;
    await sync();
    assert.equal(document.querySelector(editor).value, 'saved from chat');
    await input(editor, 'local draft');
    remote.files[0] = {name: 'main.py', content: 'newer saved version', revision: 3};
    remote.revision++;
    await sync();
    assert.equal(document.querySelector(editor).value, 'local draft');
    assert.match(document.body.textContent, /rascunho foi preservado/);
  } finally {
    await env.dispose();
  }
});
test('v9 opens code from the file sidebar, saves a scoped draft and shows execution output without a modal',async()=>{
 const env=environment(),store=fixture({...empty,files:[{name:'main.py',content:'print(1)',revision:1}]});const drafts=[];
 window.cyroEV={draft:async c=>{drafts.push(c);return null;},execute:store.execute};
 try{
  await env.mount(env.EVStudio,{projectId:'space',hidden:false,visible:true,refreshKey:0,request:store.request});await settle();
  await click('.ev-category-home button:first-child');await click('.ev-resource-open');await settle();assert.equal(document.querySelector('dialog'),null);
  assert.equal(document.querySelector('textarea[aria-label="Editor de código"]').value,'print(1)');
  await input('textarea[aria-label="Editor de código"]','print(42)');await click('button[aria-label="Salvar código"]');await settle();
  const save=store.calls.find(c=>c.action==='workbench.write');assert.equal(save.projectId,'space');assert.equal(save.expectedFileRevision,1);assert.equal(save.content,'print(42)');
  assert.ok(drafts.some(c=>c.operation==='write'&&c.content.studioVersion===9));
  await click('.ev-run-primary');await settle();
  assert.match(document.querySelector('[aria-label="Painel de preview"]').textContent,/42/);
  assert.equal(document.querySelector('[aria-label="Arquivos e painéis do EV"]')!==null,true);
 }finally{await env.dispose();}
});
test('v9 tables created by the chat open in the dock and cell edits use resource revision',async()=>{
 const env=environment(),store=fixture({...empty,revision:1,tables:[{name:'prazos',columns:['Destino','Dias'],rows:[['São Paulo',3]],revision:2}],panel:{kind:'table',target:'prazos',source:'workbench',token:'chat-created'}});
 window.cyroEV={draft:async()=>null};
 try{
  await env.mount(env.EVStudio,{projectId:'space',hidden:false,visible:true,request:store.request});await settle();
  await input('input[aria-label="Linha 1, coluna Dias"]','4');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar alterações'));await settle();
  const command=store.calls.find(c=>c.action==='workbench.table');assert.equal(command.expectedTableRevision,2);assert.deepEqual(command.rows,[['São Paulo',4]]);
  assert.equal(document.querySelector('dialog'),null);
 }finally{await env.dispose();}
});
test('v9 HTML preview is sanitized and sandboxed, and fenced chat code runs only after a click',async()=>{
 const env=environment();let run;
 try{
  await env.mount(env.EVPreview,{preview:{format:'html',content:'<script>parent.cyroEV.execute()</script><h1>Resultado</h1><img src="https://evil.test/x" onerror="alert(1)"><a href="https://evil.test">link</a>'}});
  const frame=document.querySelector('iframe');assert.equal(frame.getAttribute('sandbox'),'');assert.match(frame.srcdoc,/default-src 'none'/);assert.doesNotMatch(frame.srcdoc,/<script|onerror=|https:\/\/evil/);assert.match(frame.srcdoc,/Resultado/);
  await env.mount(env.Markdown,{text:'```python\nprint(42)\n```',onRunCode:value=>{run=value;},onOpenCode:()=>{}});
  assert.equal(run,undefined);await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Executar'));assert.equal(run.language,'python');assert.match(run.content,/print\(42\)/);
 }finally{await env.dispose();}
});
test('v9 keeps edits after a conflicting save and preserves a local protected draft',async()=>{
 const env=environment(),store=fixture({...empty,files:[{name:'main.py',content:'print(1)',revision:1}]});let local;
 window.cyroEV={draft:async c=>{if(c.operation==='write')local=c.content;return null;}};
 try{
  await env.mount(env.EVStudio,{projectId:'space',hidden:false,visible:true,request:async c=>{if(c.action==='workbench.write')throw Error('Este arquivo mudou. Seu rascunho foi preservado.');return store.request(c);}});await settle();await click('.ev-category-home button:first-child');await click('.ev-resource-open');await input('textarea[aria-label="Editor de código"]','edited privately');await click('button[aria-label="Salvar código"]');await settle();
  assert.equal(document.querySelector('textarea').value,'edited privately');assert.ok(Object.values(local.drafts).some(d=>d.content==='edited privately'));
 }finally{await env.dispose();}
});

test('v9 edits existing typed space tables without converting decimals through floating point',async()=>{
 const env=environment();let revision=3,data={amount:'12.34',active:true},saved;
 window.cyroEV={draft:async()=>null};
 const request=async c=>{
  if(c.action==='workbench.list')return {...empty,panel:{kind:'table',source:'space',target:'central',token:'existing'}};
  if(c.action==='tables.list')return {tables:[{id:'central',name:'Financeiro',rowCount:1}]};
  if(c.action==='files.list')return {files:[]};
  if(c.action==='table.read')return {table:{name:'Financeiro',revision,rowCount:1,columns:[{id:'amount',name:'Total',type:'CURRENCY'},{id:'active',name:'Ativo',type:'BOOLEAN'}]},rows:[{id:'row-1',data}]};
  if(c.action==='table.rows.update'){saved=c;data=c.rows[0].data;revision++;return {revision};}
  throw Error(c.action);
 };
 try{
  await env.mount(env.EVStudio,{projectId:'space',hidden:false,visible:true,request});await settle();
  await input('input[aria-label="Linha 1, coluna Total"]','15,20');
  await act(async()=>{const select=document.querySelector('select[aria-label="Linha 1, coluna Ativo"]');select.value='false';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar alterações'));await settle();
  assert.equal(saved.expectedRevision,3);assert.equal(saved.confirmed,true);assert.deepEqual(saved.rows,[{id:'row-1',data:{amount:'15.20',active:false}}]);
 }finally{await env.dispose();}
});
test('v9 recovers a legacy editor draft as a separate copy instead of replacing a newer saved file',async()=>{
 const env=environment(),store=fixture({...empty,files:[{name:'main.py',content:'new saved version',revision:3}]});let first=true;
 window.cyroEV={draft:async c=>{if(c.operation==='read'&&first){first=false;return {name:'main.py',content:'old private draft'};}return null;}};
 try{
  await env.mount(env.EVStudio,{projectId:'space',hidden:false,visible:true,request:store.request});await settle();
  assert.equal(document.querySelector('textarea[aria-label="Editor de código"]').value,'old private draft');
  assert.notEqual(document.querySelector('[aria-label="Nome do arquivo de código"]').value,'main.py');
  assert.equal(store.get().files[0].content,'new saved version');assert.equal(store.calls.filter(c=>c.action==='workbench.write').length,0);
 }finally{await env.dispose();}
});
test('v9 editor handles save and indentation and provides Escape then Tab to leave the editor',async()=>{
 const env=environment();let changed,saved=0;
 try{
  await env.mount(env.EVCodeEditor,{name:'main.py',value:'print(1)',onChange:v=>{changed=v;},onSave:()=>{saved++;}});
  const area=document.querySelector('textarea');area.setSelectionRange(0,0);
  await act(async()=>area.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
  assert.equal(changed,'  print(1)');
  await act(async()=>area.dispatchEvent(new window.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true})));assert.equal(saved,1);
  await act(async()=>area.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  const tab=new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});await act(async()=>area.dispatchEvent(tab));assert.equal(tab.defaultPrevented,false);
 }finally{await env.dispose();}
});

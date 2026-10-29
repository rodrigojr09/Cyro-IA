// Render the real admin components against synthetic data; never contact Cloud.
const path = require("node:path");
const fs = require("node:fs/promises");
const root = path.resolve(__dirname, "..");
const desktopRequire = require("node:module").createRequire(
  path.join(root, "desktop/package.json"),
);
const output = path.join(root, "build", "admin-layout");

async function prepare() {
  await fs.mkdir(output, { recursive: true });
  await require("esbuild").build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import Dashboard from './cloud/components/dashboard';
import {DashboardDataProvider} from './cloud/components/dashboard-data';
        import Login from './cloud/app/login/page';
        const long='Cliente com nome extenso para verificar a quebra de texto';
        const employee={id:'client-1',name:long,email:'email.muito.longo.para.validar.layout@example.test',role:'EMPLOYEE',status:'ACTIVE',monthlyTokenLimit:100000000};
        const fixture={actor:{name:long,role:'SUPER_ADMIN'},employees:[employee],
          devices:[{id:'device-1',name:long,userId:employee.id,user:{name:long},lastSeenAt:new Date().toISOString(),revokedAt:null}],
          usage:[{id:'usage-1',userId:employee.id,user:{name:long},model:'gpt-4.1-mini',inputTokens:1000,outputTokens:200,estimatedCost:'0.001',createdAt:new Date().toISOString()}],
          audit:[{id:'audit-1',action:'desktop.login',targetType:'Device',createdAt:new Date().toISOString()}]};
        const management={settings:{intelligenceEnabled:true,maxOutputTokens:3500},canConfigure:true};
        fixture.usageReport={perUser:5,page:1,pages:2,userCount:12,total:{inputTokens:120000,outputTokens:24000,tokens:144000,calls:480},users:Array.from({length:10},(_,i)=>({userId:'client-'+i,name:i===0?long:'Usuário '+(i+1),inputTokens:10000,outputTokens:2000,tokens:12000,calls:40,cost:i?'0.01':null,unpricedCalls:i?0:40,recent:Array.from({length:5},(_,j)=>({...fixture.usage[0],id:'usage-'+i+'-'+j}))}))};
        const credentials={openai:{revision:0,source:'environment',enabled:true,hasApiKey:false,allowedModels:['gpt-4.1-mini'],voiceEnabled:false},spotify:{revision:0,source:'environment',enabled:true,hasClientSecret:false,clientId:'a075ad4ae29f41c5a3df8d2ff9c84972',redirectUri:'https://cronosjarvis.vercel.app/api/integrations/spotify/callback'}};
        const usageFixture=(url)=>{const filters=new URL(url,'https://fixture.example.test').searchParams;const empty=filters.get('from')==='2020-01-01';return {...fixture,usageReport:empty?{...fixture.usageReport,userCount:0,pages:1,total:{inputTokens:0,outputTokens:0,tokens:0,calls:0},users:[]}:fixture.usageReport};};
        const releases={configured:true,warning:'',tags:[{name:'v6.10.0',version:'6.10.0',used:true},{name:'v6.3.0',version:'6.3.0',used:false}],history:[{id:'release-1',version:'6.10.0',githubTag:'v6.10.0',status:'PUBLISHED',setupUrl:'https://github.com/rodrigojr09/Cyro-IA/releases/download/v6.10.0/Setup.exe',githubReleaseId:'123456',publishedAt:new Date().toISOString(),fileSize:184000000,checksum:'a'.repeat(64),changelog:'Notas de uma versão publicada com informações claras.',error:null,leaseUntil:null}]};
        window.apiReads={};window.fetch=async (url,options)=>{if(!options?.method){window.apiReads[url]=(window.apiReads[url]||0)+1;await new Promise(r=>setTimeout(r,40));}if(String(url).includes('provider-settings')&&options?.method==='POST')window.providerWrite=JSON.parse(options.body);return {ok:true,status:200,json:async()=>options?.method==='POST'?{ok:true}:String(url).includes('provider-settings')?credentials:String(url).includes('management')?management:String(url).includes('/api/releases')?{...releases,configured:window.publisherConfigured!==false}:usageFixture(url)};};
        const section=new URLSearchParams(location.search).get('section');
        const root=createRoot(document.getElementById('root'));window.navigateFixture=(section,query='')=>root.render(section==='login'?<Login/>:<DashboardDataProvider><Dashboard section={section} query={query}/></DashboardDataProvider>);new MutationObserver(()=>{if(document.querySelector('.loading-spinner')&&!document.querySelector('.shell'))window.loadingObserved=true;}).observe(document.getElementById('root'),{childList:true,subtree:true});window.navigateFixture(section);`,
      resolveDir: root,
      loader: "tsx",
    },
    bundle: true,
    jsx: "automatic",
    outfile: path.join(output, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "preview-navigation",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "link",
            namespace: "preview",
          }));
          build.onLoad({ filter: /.*/, namespace: "preview" }, () => ({
            contents: `import React from 'react'; export default function Link(props) { return React.createElement('a',props); }`,
            resolveDir: root,
          }));
        },
      },
    ],
  });
  await fs.copyFile(
    path.join(root, "cloud/app/globals.css"),
    path.join(output, "style.css"),
  );
  await fs.writeFile(
    path.join(output, "index.html"),
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script></html>',
  );
  const { spawnSync } = require("node:child_process");
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(
    desktopRequire("electron"),
    [__filename, "--render"],
    { stdio: "inherit", env: environment },
  );
  process.exitCode = result.status ?? 1;
}

async function render() {
  const { app, BrowserWindow } = desktopRequire("electron");
  app.disableHardwareAcceleration();
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: 1280,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  let checks = 0;
  try {
    for (const width of [320, 390, 768, 1024, 1440]) {
      window.setContentSize(width, 1000);
      for (const section of [
        "login",
        "dashboard",
        "clients",
        "devices",
        "usage",
        "settings",
        "credentials",
        "audit",
        "versions",
      ]) {
        await window.loadFile(path.join(output, "index.html"), {
          query: { section },
        });
        // Wait for React and the local mock API to finish rendering.
        await window.webContents.executeJavaScript(
          `new Promise((resolve,reject)=>{let tries=0;const poll=()=>{const ready=${JSON.stringify(section)}==='login'?document.querySelector('form'):document.querySelector('.employee-row, table, .metrics, .form-grid, .release-manager');if(ready) requestAnimationFrame(()=>requestAnimationFrame(resolve));else if(++tries>100)reject(Error('Render timeout'));else setTimeout(poll,20)};poll()})`,
        );
        const geometry = await window.webContents.executeJavaScript(
          `({width:innerWidth,scroll:document.documentElement.scrollWidth,logoutVisible:!!document.querySelector('[aria-label="Sair"]')?.getClientRects().length,footer:document.querySelector('footer')?.textContent,tallestField:Math.max(0,...Array.from(document.querySelectorAll('.form-grid label,.employee-row label,.generated label'),label=>label.getBoundingClientRect().height))})`,
        );
        if (geometry.scroll > geometry.width + 1)
          throw Error(
            `${section} overflows at ${width}px: ${JSON.stringify(geometry)}`,
          );
        if (section !== "login" && !geometry.logoutVisible)
          throw Error(`Logout hidden at ${width}px`);
        if (
          section !== "login" &&
          !geometry.footer?.includes(`v${require("../package.json").version}`)
        )
          throw Error(`Incorrect dashboard version at ${width}px`);
        if (width <= 420 && geometry.tallestField > 140)
          throw Error(`Excessive field spacing in ${section} at ${width}px`);
        if (
          [
            "dashboard",
            "clients",
            "login",
            "credentials",
            "usage",
            "versions",
          ].includes(section) &&
          [390, 1440].includes(width)
        ) {
          const screenshot = await window.webContents.capturePage();
          await fs.writeFile(
            path.join(output, `${section}-${width}.png`),
            screenshot.toPNG(),
          );
        }
        if (section === "versions") {
          await window.webContents.executeJavaScript(
            "[...document.querySelectorAll('button')].find(b=>b.textContent==='Nova versão').click();void 0;",
          );
          await window.webContents.executeJavaScript(
            "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
          );
          const versionForm = await window.webContents.executeJavaScript(
            `({options:[...document.querySelectorAll('.release-form select option')].map(o=>({value:o.value,disabled:o.disabled})),file:document.querySelector('.release-form input[type=file]')?.accept,overflow:document.documentElement.scrollWidth>innerWidth+1,repo:[...document.querySelectorAll('.release-manager a')].some(a=>a.href==='https://github.com/rodrigojr09/Cyro-IA')})`,
          );
          if (
            !versionForm.options.some(
              (o) => o.value === "v6.10.0" && o.disabled,
            ) ||
            !versionForm.options.some(
              (o) => o.value === "v6.3.0" && !o.disabled,
            ) ||
            versionForm.file !== ".exe" ||
            versionForm.overflow ||
            !versionForm.repo
          )
            throw Error(
              "Version form/tag/repository layout failed at " + width,
            );
          if ([390, 1440].includes(width))
            await fs.writeFile(
              path.join(output, "versions-form-" + width + ".png"),
              (await window.webContents.capturePage()).toPNG(),
            );
          if (width === 1440) {
            await window.webContents.executeJavaScript(
              "window.publisherConfigured=false;[...document.querySelectorAll('button')].find(b=>b.textContent==='Atualizar histórico').click();void 0;",
            );
            await window.webContents.executeJavaScript(
              "new Promise((resolve,reject)=>{let tries=0;const poll=()=>{if([...document.querySelectorAll('button')].find(b=>b.textContent==='Nova versão')?.disabled)resolve();else if(++tries>100)reject(Error('Publication disabled gate failed'));else setTimeout(poll,20)};poll()})",
            );
          }
        }
        if (section === "usage") {
          const consumption = await window.webContents.executeJavaScript(`({
            charts:document.querySelectorAll('.usage-chart').length,
            users:document.querySelectorAll('.usage-user').length,
            rows:[...document.querySelectorAll('.usage-user tbody')].map(t=>t.children.length),
            limit:document.querySelector('[name=perUser]').value,
            next:document.querySelector('.usage-pagination a')?.getAttribute('href'),
            graphsFirst:!!(document.querySelector('.usage-charts').compareDocumentPosition(document.querySelector('.usage-user'))&Node.DOCUMENT_POSITION_FOLLOWING)
          })`);
          if (
            consumption.charts !== 2 ||
            consumption.users !== 10 ||
            consumption.rows.some((n) => n !== 5) ||
            consumption.limit !== "5" ||
            !consumption.next.includes("usagePage=2") ||
            !consumption.graphsFirst
          )
            throw Error(
              "Consumo: gráficos, limite ou paginação incorretos: " +
                JSON.stringify(consumption),
            );
          if (width === 1440) {
            await window.webContents.executeJavaScript(
              `window.navigateFixture('usage','?usage=1&from=2026-10-01&to=2026-10-26&clientId=client-1');void 0;`,
            );
            await window.webContents.executeJavaScript(
              `new Promise((resolve,reject)=>{let tries=0;const poll=()=>{if(document.querySelector('[name=from]')?.value==='2026-10-01')resolve();else if(++tries>100)reject(Error('Filtro timeout'));else setTimeout(poll,20)};poll()})`,
            );
            const preserved = await window.webContents.executeJavaScript(
              `({date:document.querySelector('[name=to]').value,user:document.querySelector('[name=clientId]').value,next:document.querySelector('.usage-pagination a').getAttribute('href')})`,
            );
            if (
              preserved.date !== "2026-10-26" ||
              preserved.user !== "client-1" ||
              !preserved.next.includes("from=2026-10-01") ||
              !preserved.next.includes("clientId=client-1")
            )
              throw Error("Consumo perdeu filtros ao paginar");
            await window.webContents.executeJavaScript(
              `window.navigateFixture('usage','?usage=1&from=2020-01-01');void 0;`,
            );
            await window.webContents.executeJavaScript(
              `new Promise((resolve,reject)=>{let tries=0;const poll=()=>{if(document.querySelector('.usage-panel .empty'))resolve();else if(++tries>100)reject(Error('Estado vazio timeout'));else setTimeout(poll,20)};poll()})`,
            );
            const empty = await window.webContents.executeJavaScript(
              `({message:document.querySelector('.usage-panel .empty').textContent,users:document.querySelectorAll('.usage-user').length})`,
            );
            if (!empty.message.includes("Nenhum consumo") || empty.users !== 0)
              throw Error("Consumo vazio mostra dados incorretos");
          }
        }
        if (section === "credentials" && width === 1440) {
          const before = await window.webContents.executeJavaScript(
            `({reads:JSON.stringify(window.apiReads),loading:window.loadingObserved})`,
          );
          if (!before.loading) throw Error("Loading gate was not displayed");
          await window.webContents.executeJavaScript(
            `window.navigateFixture('dashboard');void 0;`,
          );
          await window.webContents.executeJavaScript(
            `new Promise(r=>setTimeout(r,80))`,
          );
          await window.webContents.executeJavaScript(
            `window.navigateFixture('credentials');void 0;`,
          );
          await window.webContents.executeJavaScript(
            `new Promise(r=>setTimeout(r,80))`,
          );
          const after = await window.webContents.executeJavaScript(
            `JSON.stringify(window.apiReads)`,
          );
          if (before.reads !== after)
            throw Error("Navigation repeated cached API requests");
          await window.webContents.executeJavaScript(
            `document.querySelector('.credentials-grid input[type=password]').value='sk-ui-fixture-12345678901234567890';document.querySelector('.credentials-grid form').requestSubmit();void 0;`,
          );
          await window.webContents.executeJavaScript(
            `new Promise((resolve,reject)=>{let tries=0;const poll=()=>{if(document.querySelector('.credentials-page [role=status]'))resolve();else if(++tries>100)reject(Error('Save timeout'));else setTimeout(poll,20)};poll();})`,
          );
          const saved = await window.webContents.executeJavaScript(
            `({provider:window.providerWrite?.provider,hasSecret:!!window.providerWrite?.apiKey,cleared:document.querySelector('.credentials-grid input[type=password]').value==='',message:document.querySelector('.credentials-page [role=status]').textContent})`,
          );
          if (
            saved.provider !== "openai" ||
            !saved.hasSecret ||
            !saved.cleared ||
            !saved.message.includes("não foi testada")
          )
            throw Error("Falha na proteção do formulário de credenciais");
        }
        if ([390, 1440].includes(width)) {
          const light = await window.webContents.executeJavaScript(`(() => {
            document.documentElement.dataset.theme='light';
            const s=getComputedStyle(document.documentElement);
            return {bg:s.getPropertyValue('--bg').trim(),text:s.getPropertyValue('--text').trim(),overflow:document.documentElement.scrollWidth>innerWidth+1};
          })()`);
          if (
            light.bg !== "#f7f9fc" ||
            light.text !== "#172033" ||
            light.overflow
          )
            throw Error(`Light theme failed in ${section} at ${width}px`);
          if (section === "usage" && width === 1440) {
            await window.webContents.executeJavaScript(
              "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
            );
            await fs.writeFile(
              path.join(output, "usage-light-1440.png"),
              (await window.webContents.capturePage()).toPNG(),
            );
          }
          await window.webContents.executeJavaScript(
            "delete document.documentElement.dataset.theme",
          );
          checks++;
        }
        checks++;
      }
    }
    console.log(
      `Admin layout: ${checks} checks passed (synthetic data, real Chromium). Screenshots: build/admin-layout.`,
    );
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
}
if (process.argv.includes("--render")) void render();
else void prepare();

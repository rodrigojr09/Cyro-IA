// Isolated interoperability test. Never reads repository .env or production URLs.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  mkdir,
  writeFile,
  cp,
  symlink,
} from "node:fs/promises";
import { createServer } from "node:net";
import { spawn, ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve, join, sep, basename } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { startRedisFixture } from "./redis-fixture";
import { startGitHubFixture, installerFixture } from "./github-fixture";

const root = resolve(
  process.env.CYRO_WORKSPACE_ROOT ||
    fileURLToPath(new URL("../../../../", import.meta.url)),
);
const sandboxRoot = join(root, ".cyro");
await mkdir(sandboxRoot, { recursive: true });
const temporary = await mkdtemp(join(sandboxRoot, "integration-run-"));
const processLogs = new Map<string, Buffer[]>();
const children: ChildProcess[] = [],
  sockets: PGLiteSocketServer[] = [],
  databases: PGlite[] = [];
let filesApp: any, filesRepository: any, filesCache: any;
const redis = await startRedisFixture();
const github = await startGitHubFixture();
const publicAlias = "https://api.cyro.test";
const localSecret = () => randomBytes(32).toString("hex");
const serviceKey = localSecret(),
  contextKey = localSecret(),
  password = localSecret();
const applicationId = "8e17442b-fbe8-42e2-aad7-bd7390422647";
let checks = 0;
const check = (name: string) => {
  checks++;
  console.log("OK: " + name);
};
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
function environment(extra: Record<string, string>) {
  const allowed = new Set([
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "LOCALAPPDATA",
    "APPDATA",
    "SYSTEMDRIVE",
  ]);
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        allowed.has(key.toUpperCase()),
      ),
    ),
    ...extra,
  };
}
function launch(
  cwd: string,
  args: string[],
  extra: Record<string, string>,
  label: string,
) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: environment(extra),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const log: Buffer[] = [];
  processLogs.set(label, log);
  child.stdout?.on("data", (value) => log.push(Buffer.from(value)));
  child.stderr?.on("data", (value) => log.push(Buffer.from(value)));
  return child;
}
async function waitFor(child: ChildProcess, url: string) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw Error("Processo de teste encerrou antes de ficar pronto.");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Error("Serviço local de teste não ficou pronto.");
}
async function isolatedApp(project: string) {
  const source = join(root, project),
    target = join(temporary, project);
  await mkdir(target, { recursive: true });
  const entries = [
    "app",
    "lib",
    "contracts",
    "components",
    "vendor",
    "generated",
    "server.ts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next-env.d.ts",
  ];
  for (const name of entries) {
    try {
      await cp(join(source, name), join(target, name), { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (project === "cyro-backend")
    await writeFile(
      join(target, "github-fixture.mjs"),
      `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(String(input));if(["api.github.com","uploads.github.com"].includes(url.hostname))return original(${JSON.stringify(github.origin)}+url.pathname+url.search,init);return original(input,init);};`,
    );
  await symlink(
    join(source, "node_modules"),
    join(target, "node_modules"),
    "junction",
  );
  await writeFile(
    join(target, "next.config.ts"),
    `export default {poweredByHeader:false,turbopack:{root:${JSON.stringify(root)}},serverExternalPackages:["pg","@prisma/adapter-pg"]};`,
  );
  return target;
}
async function database(project: string) {
  const db = await PGlite.create();
  databases.push(db);
  const migrations = join(root, project, "prisma/migrations");
  for (const name of (await readdir(migrations))
    .filter((x) => /^\d/.test(x))
    .sort())
    await db.exec(
      await readFile(join(migrations, name, "migration.sql"), "utf8"),
    );
  const port = await freePort();
  const socket = new PGLiteSocketServer({
    db,
    port,
    host: "127.0.0.1",
    maxConnections: 10,
  });
  await socket.start();
  sockets.push(socket);
  return {
    db,
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
  };
}
async function json(response: Response, expected = 200) {
  assert.equal(
    response.status,
    expected,
    `HTTP inesperado: ${response.status}`,
  );
  return response.json();
}
try {
  const backendDatabase = await database("cyro-backend"),
    filesDatabase = await database("cyro-files");
  const salt = randomBytes(16).toString("hex");
  const encoded = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const owner = randomUUID(),
    other = randomUUID();
  await backendDatabase.db.query(
    'INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW()),($6,$7,$8,$4,$5,NOW())',
    [
      owner,
      "Admin integration",
      "owner@cyro.test",
      encoded,
      "SUPER_ADMIN",
      other,
      "Other integration",
      "other@cyro.test",
    ],
  );
  await filesDatabase.db.query(
    'INSERT INTO "Application" (id,name,"updatedAt") VALUES ($1,$2,NOW())',
    [applicationId, "Cyro integration"],
  );

  const filesRoot = join(root, "cyro-files");
  const { parseConfig } = await import(
    pathToFileURL(join(filesRoot, "src/config/env.ts")).href
  );
  const { PrismaRepository } = await import(
    pathToFileURL(join(filesRoot, "src/repositories/prisma.ts")).href
  );
  const { RedisEphemeral } = await import(
    pathToFileURL(join(filesRoot, "src/services/redis.ts")).href
  );
  const { createApp } = await import(
    pathToFileURL(join(filesRoot, "src/app.ts")).href
  );
  filesRepository = new PrismaRepository(filesDatabase.url);
  filesCache = new RedisEphemeral(`redis://127.0.0.1:${redis.port}/2`);
  await filesCache.connect();
  const config = parseConfig({
    NODE_ENV: "test",
    DATABASE_URL: filesDatabase.url,
    REDIS_URL: `redis://127.0.0.1:${redis.port}/2`,
    STORAGE_PATH: join(temporary, "storage"),
    SERVICE_AUTH_SECRET: serviceKey,
    SERVICE_CONTEXT_SECRET: contextKey,
    SIGNED_URL_SECRET: localSecret(),
    LOG_LEVEL: "silent",
    MIN_FREE_DISK_BYTES: 1,
  });
  ({ app: filesApp } = await createApp(config, filesRepository, filesCache));
  const filesOrigin = await filesApp.listen({ host: "127.0.0.1", port: 0 });
  const backendPort = await freePort(),
    cloudPort = await freePort();
  const backendOrigin = `http://localhost:${backendPort}`,
    cloudOrigin = `http://localhost:${cloudPort}`;
  const backend = launch(
    await isolatedApp("cyro-backend"),
    ["--import", "tsx", "--import", "./github-fixture.mjs", "server.ts"],
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(backendPort),
      DATABASE_URL: backendDatabase.url,
      REDIS_URL: `redis://127.0.0.1:${redis.port}/1`,
      AUTH_SECRET: localSecret(),
      APP_ORIGIN: cloudOrigin,
      API_PUBLIC_ORIGIN: publicAlias,
      CYRO_FILES_URL: filesOrigin,
      CYRO_FILES_SERVICE_KEY: serviceKey,
      CYRO_FILES_CONTEXT_SECRET: contextKey,
      CYRO_FILES_APPLICATION_ID: applicationId,
    },
    "backend",
  );
  await waitFor(backend, backendOrigin + "/health");
  const cloud = launch(
    await isolatedApp("cyro-cloud"),
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(cloudPort),
    ],
    { NODE_ENV: "development", CYRO_BACKEND_ORIGIN: backendOrigin },
    "cloud",
  );
  await waitFor(cloud, cloudOrigin + "/health");
  check("HTTP real de Backend, Cloud e Files disponível em portas temporárias");

  const login = await fetch(cloudOrigin + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: cloudOrigin },
    body: JSON.stringify({ email: "owner@cyro.test", password }),
  });
  await json(login);
  const cookie = login.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  const identity = await json(
    await fetch(cloudOrigin + "/api/auth/session", {
      headers: { Cookie: cookie },
    }),
  );
  assert.equal(identity.id, owner);
  check(
    "login Cloud → proxy → Backend → PostgreSQL embarcado, com cookie real",
  );
  const page = await fetch(cloudOrigin + "/dashboard", {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  assert.equal(page.status, 200);
  check("página SSR do painel autentica pela API central");
  const status = await json(
    await fetch(cloudOrigin + "/api/system/status", {
      headers: { Cookie: cookie },
    }),
  );
  assert.equal(status.dependencies.files, "ready");
  assert.equal(status.filesAuthorizationConfigured, true);
  check("diagnóstico autenticado confirma Backend → Files");

  const githubToken = "github_pat_fixture_" + localSecret();
  await json(
    await fetch(cloudOrigin + "/api/provider-settings", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: cloudOrigin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "github",
        revision: 0,
        enabled: true,
        token: githubToken,
      }),
    }),
  );
  const settings = await json(
    await fetch(cloudOrigin + "/api/provider-settings", {
      headers: { Cookie: cookie },
    }),
  );
  assert.equal(settings.github.hasToken, true);
  assert.ok(!JSON.stringify(settings).includes(githubToken));
  await json(
    await fetch(cloudOrigin + "/api/provider-settings/github/test", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: cloudOrigin,
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  check(
    "GitHub em Credenciais: token criptografado, status sem segredo e teste somente leitura (GitHub simulado)",
  );
  const bytes = installerFixture();
  const attempt = await json(
    await fetch(cloudOrigin + "/api/releases", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: cloudOrigin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "create",
        tag: "v7.0.0",
        name: "Setup.exe",
        size: bytes.length,
        changelog: "Integration fixture only",
      }),
    }),
  );
  const uploadPath = new URL(attempt.url).pathname;
  await json(
    await fetch(backendOrigin + uploadPath, {
      method: "PUT",
      headers: {
        Origin: cloudOrigin,
        Authorization: "Bearer " + attempt.ticket,
        "Content-Type": "application/vnd.microsoft.portable-executable",
      },
      body: bytes,
    }),
    202,
  );
  assert.equal(github.published, true);
  assert.equal(github.tagWrites, 0);
  const stored = await backendDatabase.db.query(
    'SELECT "setupFileId",status FROM "CyroRelease" WHERE id=$1',
    [attempt.id],
  );
  assert.ok((stored.rows[0] as any).setupFileId);
  assert.equal((stored.rows[0] as any).status, "PUBLISHED");
  check(
    "atualizador: Setup validado, armazenado no Files e publicação simulada confirmada sem criar tags",
  );

  const deviceLogin = async (email: string) =>
    json(
      await fetch(backendOrigin + "/api/device/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          deviceId: randomUUID(),
          name: "Integration",
        }),
      }),
    );
  const device = await deviceLogin("owner@cyro.test"),
    otherDevice = await deviceLogin("other@cyro.test");
  const headers = { Authorization: `Bearer ${device.credential}` };
  // v8 EV uses the same authenticated API and isolated Client rows as v7.
  const projectId = randomUUID();
  const projectCommand = (command: object, credential = device.credential) =>
    fetch(cloudOrigin + '/api/projects', { method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command) });
  const catalog = await json(await fetch(cloudOrigin + '/api/projects', { headers }));
  assert.deepEqual(Object.keys(catalog.categories), ['GENERAL', 'GRAMMAR', 'LOGISTICS']);
  const command = { action: 'create', id: projectId, name: 'Livro integrado', category: 'GRAMMAR' };
  const created = await json(await projectCommand(command));
  assert.equal(created.project.ownerId, owner);
  assert.equal(created.project.category, 'GRAMMAR');
  const retried = await json(await projectCommand(command));
  assert.equal(retried.project.id, projectId);
  const storedProject = await backendDatabase.db.query('SELECT count(*)::int AS count FROM "Project" WHERE id=$1', [projectId]);
  assert.equal((storedProject.rows[0] as any).count, 1);
  check('EV: catálogo, criação e retry atravessam Cloud → API → Prisma reais');
  assert.equal((await projectCommand({ action: 'get', id: projectId }, otherDevice.credential)).status, 404);
  assert.equal((await projectCommand({ action: 'archive', id: projectId, expectedRevision: 0, archived: true }, otherDevice.credential)).status, 404);
  assert.equal((await projectCommand({ ...command, id: randomUUID(), ownerId: owner }, otherDevice.credential)).status, 400);
  const revisionCommand = { action: 'update', id: projectId, expectedRevision: 0,
    name: 'Revisado', description: '', settings: { autoCorrect: false, language: 'pt-BR' } };
  const concurrent = await Promise.all([projectCommand(revisionCommand), projectCommand(revisionCommand)]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  const persisted = await json(await projectCommand({ action: 'get', id: projectId }));
  assert.equal(persisted.project.revision, 1);
  const cookieCatalog = await json(await fetch(cloudOrigin + '/api/projects', { headers: { Cookie: cookie } }));
  assert.equal(cookieCatalog.contract, '8.0');
  check('EV: outra conta e ownership forjado recusados; concorrência real aceita uma única revisão');
  const upload = await json(
    await fetch(backendOrigin + "/api/files", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "text/plain",
        "X-File-Name": "integration.txt",
      },
      body: "Cyro v7 real transport",
    }),
    201,
  );
  const downloaded = await fetch(cloudOrigin + `/api/files/${upload.id}`, {
    headers,
  });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), "Cyro v7 real transport");
  check(
    "upload/download real: cliente → Backend → SDK → Files → Prisma → disco temporário",
  );
  assert.equal(
    (
      await fetch(backendOrigin + `/api/files/${upload.id}`, {
        headers: { Authorization: `Bearer ${otherDevice.credential}` },
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(filesOrigin + `/api/v1/files/${upload.id}/download`)).status,
    401,
  );
  check("outra conta e acesso direto ao Files são recusados");
  await json(await fetch(backendOrigin + "/api/device/session", { headers }));
  assert.equal(
    (
      await fetch(backendOrigin + "/api/files/" + upload.id, {
        method: "DELETE",
        headers,
      })
    ).status,
    204,
  );
  check("exclusão coordenada remove arquivo e vínculo autorizado");

  // Run the actual Desktop HTTP/session client. Windows safeStorage is exercised by Electron.
  const desktop = resolve(
    process.env.CYRO_DESKTOP_ROOT || join(root, "cyro-desktop"),
  );
  const requireDesktop = createRequire(join(desktop, "desktop/package.json"));
  const electron = requireDesktop("electron") as string;
  const electronChild = spawn(
    electron,
    [join(desktop, "desktop/tests/electron/platform-session.cjs")],
    {
      cwd: desktop,
      windowsHide: true,
      env: environment({
        CYRO_TEST_ORIGIN: backendOrigin,
        CYRO_TEST_EMAIL: "owner@cyro.test",
        CYRO_TEST_PASSWORD: password,
        CYRO_TEST_DATA: join(temporary, "desktop"),
        CYRO_TEST_UPDATE_ALIAS: publicAlias,
      }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.push(electronChild);
  const desktopOutput: Buffer[] = [];
  electronChild.stdout?.on("data", (v) => desktopOutput.push(Buffer.from(v)));
  electronChild.stderr?.on("data", (v) => desktopOutput.push(Buffer.from(v)));
  const exit = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Desktop integration timeout")),
      90000,
    );
    electronChild.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    electronChild.on("error", reject);
  });
  assert.equal(exit, 0, Buffer.concat(desktopOutput).toString().slice(-1500));
  check(
    "Electron/Windows: cliente Desktop faz login, persiste sessão protegida, consulta chats e sai pela API real",
  );
  const accountURL=cloudOrigin+'/api/account';
  const ownedAccount=()=>fetch(accountURL,{headers:{Cookie:cookie}}).then(json);
  const initialAccount=await ownedAccount();
  const updatePlan=async(planCode:'FREE'|'PAID',revision:number)=>json(await fetch(cloudOrigin+'/api/commercial',{method:'POST',headers:{Cookie:cookie,Origin:cloudOrigin,'Content-Type':'application/json'},body:JSON.stringify({action:'user.update',id:owner,expectedRevision:revision,planCode,state:planCode==='FREE'?'FREE':'ACTIVE',expiresAt:null,status:'ACTIVE',confirmed:true,reason:'Synthetic manual plan integration test',operationId:randomUUID()})}));
  await updatePlan('PAID',initialAccount.plan.subscription.revision);
  const paidAccount=await ownedAccount();assert.equal(paidAccount.plan.code,'PAID');assert.equal(paidAccount.upgrade.method,'ADMIN_MANUAL');assert.equal(paidAccount.user.role,'SUPER_ADMIN');
  await updatePlan('FREE',paidAccount.plan.subscription.revision);
  assert.equal((await ownedAccount()).plan.code,'FREE');
  assert.equal((await projectCommand({action:'get',id:created.project.id},device.credential)).status,200);
  check('v8.4: concessão manual PAID e downgrade FREE via Cloud → API → PostgreSQL, com EV e papel preservados');
  assert.equal((await fetch(cloudOrigin+'/api/commercial?kind=users')).status,401);
  const publicConfiguration=await json(await fetch(cloudOrigin+'/api/public/account'));assert.equal(publicConfiguration.paidActivation,'ADMIN_MANUAL');assert.equal(publicConfiguration.purchaseEnabled,false);
  check('v8.4: administração sem sessão bloqueada e contrato público sem compra automática');
  await json(
    await fetch(cloudOrigin + "/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, Origin: cloudOrigin },
    }),
  );
  assert.equal(
    (
      await fetch(cloudOrigin + "/api/auth/session", {
        headers: { Cookie: cookie },
      })
    ).status,
    401,
  );
  check("logout administrativo revoga a sessão no Backend");
  const report = {
    date: new Date().toISOString(),
    checks,
    result: "passed",
    transport:
      "actual HTTP + actual Prisma + PGlite TCP + temporary disk + actual Electron session client",
    redis: "RESP fixture; not a Redis 7.2 certification",
    github: "local fixture; no real tag or release changed",
    production: "not accessed",
  };
  await mkdir(join(root, ".cyro"), { recursive: true });
  await writeFile(
    join(root, ".cyro/integration-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `${checks} verificações integradas passaram. Sem produção; PostgreSQL embarcado e Redis de teste explicitamente isolados.`,
  );
} catch (error) {
  // Copy only local test process logs for debugging. All credentials are random throwaway fixtures.
  const output = join(root, ".cyro/integration-debug");
  await mkdir(output, { recursive: true });
  for (const [name, buffers] of processLogs)
    await writeFile(join(output, name + ".log"), Buffer.concat(buffers));
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const child of children.reverse())
    if (child.exitCode === null) {
      if (process.platform === "win32")
        await new Promise((resolve) =>
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          }).on("exit", resolve),
        );
      else child.kill("SIGTERM");
    }
  if (filesApp) await filesApp.close();
  if (filesRepository) await filesRepository.close();
  if (filesCache) await filesCache.close();
  for (const socket of sockets) await socket.stop();
  for (const db of databases) await db.close();
  await redis.close();
  await github.close();
  if (
    resolve(temporary).startsWith(resolve(sandboxRoot) + sep) &&
    basename(temporary).startsWith("integration-run-")
  )
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

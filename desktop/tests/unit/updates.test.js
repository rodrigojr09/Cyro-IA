const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const crypto = require('node:crypto');
const { compare, semver, tagVersion } = require('../../scripts/updates/protocol');
const { inspect, receive } = require('../../scripts/updates/installer');
const { createUpdater } = require('../../scripts/updates/client');
const { EventEmitter } = require('node:events');
function fixture(version = '6.3.0') {
  const b = Buffer.alloc(65536);
  b.write('MZ');
  b.writeUInt32LE(128, 60);
  b.write('PE\0\0', 128);
  b.writeUInt16LE(0x14c, 132);
  b.writeUInt16LE(1, 134);
  b.writeUInt16LE(224, 148);
  b.write('.rsrc', 376);
  b.writeUInt32LE(4096, 392);
  b.writeUInt32LE(1024, 396);
  b.writeUInt32LE(0xfeef04bd, 1100);
  const n = version.split('.').map(Number);
  b.writeUInt32LE(n[0] * 65536 + n[1], 1116);
  b.writeUInt32LE(n[2] * 65536, 1120);
  b.write('NullsoftInst', 2000);
  return b;
}
test('SemVer sorts numeric versions, prerelease identifiers and ignores build metadata', () => {
  assert.equal(compare('6.10.0', '6.9.9'), 1);
  assert.equal(compare('6.3.0', '6.2.9'), 1);
  assert.equal(compare('6.3.0-beta.10', '6.3.0-beta.2'), 1);
  assert.equal(compare('6.3.0', '6.3.0-beta'), 1);
  assert.equal(compare('6.3.0+a', '6.3.0+b'), 0);
  for (const version of ['6.03.0', '6.3', '6.3.0-01', '6.3.0-', '999999999999999999.0.0'])
    assert.equal(semver(version), null);
  assert.equal(tagVersion('v6.3.0'), '6.3.0');
  assert.throws(() => tagVersion('missing'));
});
test('NSIS PE inspection rejects wrong version and non installers; receive checks exact length without replacing files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-update-test-'));
  const file = path.join(dir, 'Setup.exe');
  try {
    const b = fixture();
    await receive(Readable.from([b]), file, b.length);
    await inspect(file, '6.3.0');
    await assert.rejects(inspect(file, '6.2.0'));
    await assert.rejects(receive(Readable.from([Buffer.alloc(65536)]), file, 65536));
    assert.deepEqual(await fs.readFile(file), b);
    await fs.rm(file);
    await assert.rejects(receive(Readable.from([b.subarray(1)]), file, b.length));
    await assert.rejects(fs.stat(file));
    await fs.writeFile(file, Buffer.alloc(65536));
    await assert.rejects(inspect(file, '6.3.0'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
function updateFixture(dir, version = '6.2.2', mutate = {}) {
  const bytes = fixture(),
    checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const row = {
    id: crypto.randomUUID(),
    version: '6.3.0',
    tag: 'v6.3.0',
    setupUrl: 'https://github.com/rodrigojr09/Cyro-IA/releases/download/v6.3.0/Setup.exe',
    checksum,
    fileSize: bytes.length,
    private: true,
    transport: 'backend',
    ...mutate,
  };
  const backend = row.transport === 'backend';
  let opened = '',
    installed = '',
    downloads = 0;
  const updater = createUpdater({
    version,
    origin: 'https://cloud.example.test',
    directory: dir,
    authorize: async () => ({
      url: backend
        ? 'https://cloud.example.test/api/updates/file?ticket=short'
        : 'https://publisher.example.test/download?ticket=short',
      origin: backend ? 'https://cloud.example.test' : 'https://publisher.example.test',
      metadata: row,
    }),
    request: async (url) =>
      String(url).endsWith('/latest')
        ? Response.json({ release: row })
        : (downloads++,
          new Response(bytes, { headers: { 'content-length': String(bytes.length) } })),
    verifySignature: async () => 'NotSigned',
    openLink: async (url) => {
      opened = url;
    },
    install: async (file) => {
      installed = file;
      return true;
    },
  });
  return {
    updater,
    row,
    get opened() {
      return opened;
    },
    get installed() {
      return installed;
    },
    get downloads() {
      return downloads;
    },
  };
}
test('updater discovers a newer version, manual uses scoped link, auto verifies before install without a browser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-updater-'));
  try {
    const f = updateFixture(dir);
    assert.equal((await f.updater.check()).phase, 'available');
    await f.updater.manual();
    assert.match(f.opened, /cloud\.example\.test\/api\/updates\/file/);
    await f.updater.download();
    assert.equal(f.updater.state().phase, 'ready');
    assert.equal(f.installed, '');
    await f.updater.install();
    assert.equal(f.updater.state().phase, 'installing');
    assert.match(f.installed, /Setup.exe$/);
    assert.equal(f.downloads, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('equal/newer installed versions have no notification; checksum mismatch cannot install', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-updater-'));
  try {
    for (const version of ['6.3.0', '6.10.0'])
      assert.equal((await updateFixture(dir, version).updater.check()).phase, 'idle');
    const f = updateFixture(dir, '6.2.2', { checksum: 'a'.repeat(64) });
    await f.updater.check();
    assert.equal((await f.updater.download()).phase, 'error');
    await assert.rejects(f.updater.install());
    assert.equal(f.installed, '');
    const rows = await fs.readdir(dir);
    assert.equal(rows.length, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('tampering after download is rejected at install time', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-updater-'));
  try {
    const f = updateFixture(dir);
    await f.updater.check();
    await f.updater.download();
    const [folder] = await fs.readdir(dir);
    await fs.appendFile(path.join(dir, folder, 'Setup.exe'), 'tamper');
    await assert.rejects(f.updater.install());
    assert.equal(f.installed, '');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('development update IPC ignores checks and downloads without accessing network or disk', async () => {
  const app = new EventEmitter();
  app.isPackaged = false;
  app.getVersion = () => '6.3.0';
  const handlers = new Map();
  const ipcMain = { handle: (name, fn) => handlers.set(name, fn) };
  require('../../scripts/updates/ipc').installUpdateIPC({
    electron: {
      app,
      ipcMain,
      BrowserWindow: { getAllWindows: () => [] },
      shell: {
        openExternal: () => {
          throw Error('Must not open');
        },
      },
    },
    service: () => ({ current: () => ({}) }),
    origin: 'https://must-not-call.invalid',
    dataDir: os.tmpdir(),
  });
  const mainFrame = {
    url: require('node:url').pathToFileURL(path.resolve(__dirname, '../../index.html')).href,
  };
  const event = { senderFrame: mainFrame, sender: { mainFrame } };
  for (const action of ['state', 'check', 'download', 'install', 'manual'])
    assert.equal((await handlers.get('cyro:updates-' + action)(event)).phase, 'disabled');
  app.emit('jarvis:session-changed', true);
  app.emit('before-quit');
});
test('an interrupted installation is reported on restart; successful version clears the marker', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-updater-'));
  try {
    const f = updateFixture(dir);
    await f.updater.check();
    await f.updater.download();
    await f.updater.install();
    const restarted = updateFixture(dir);
    assert.match((await restarted.updater.check()).error, /anterior/);
    await updateFixture(dir, '6.3.0').updater.check();
    await assert.rejects(fs.stat(path.join(dir, 'install-pending.json')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Files-backed updates use the configured API even for a public GitHub repository', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-files-update-'));
  try {
    const f = updateFixture(dir, '6.2.2', { transport: 'backend', private: false });
    await f.updater.check();
    await f.updater.manual();
    assert.match(f.opened, /cloud\.example\.test\/api\/updates\/file/);
    await f.updater.download();
    assert.equal(f.updater.state().phase, 'ready');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('automatic checks retry a temporary failure after five minutes instead of waiting six hours', async () => {
  const originalFetch=global.fetch,originalNow=Date.now,originalInterval=global.setInterval,originalClear=global.clearInterval;
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cyro-update-retry-'));
  let now=100_000_000,reads=0,tick;
  const app=new EventEmitter();app.isPackaged=true;app.getVersion=()=> '6.4.0';
  try{
    Date.now=()=>now;
    global.fetch=async()=>{reads++;return reads===1?new Response(null,{status:503}):Response.json({release:null});};
    global.setInterval=(callback)=>{tick=callback;return {unref(){}};};global.clearInterval=()=>{};
    require('../../scripts/updates/ipc').installUpdateIPC({electron:{app,ipcMain:{handle(){}},BrowserWindow:{getAllWindows:()=>[]},shell:{}},service:()=>({current:()=>({})}),origin:'https://api.example.test',dataDir:directory});
    await new Promise(setImmediate);assert.equal(reads,1);
    await tick();assert.equal(reads,1);
    now+=5*60_000;await tick();assert.equal(reads,2);
    now+=5*60_000;await tick();assert.equal(reads,2);
    app.emit('before-quit');
  }finally{global.fetch=originalFetch;Date.now=originalNow;global.setInterval=originalInterval;global.clearInterval=originalClear;await fs.rm(directory,{recursive:true,force:true});}
});

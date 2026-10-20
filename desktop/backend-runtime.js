// Owns only the packaged backend it starts. Development keeps using start.py.
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { createHash } = require('node:crypto');
const path = require('node:path');

function identity(executable) {
  return createHash('sha256').update(path.resolve(executable).toLowerCase()).digest('hex');
}

async function probe(fetcher = fetch) {
  try {
    const response = await fetcher('http://127.0.0.1:8765/health', {
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    });
    return response.ok ? await response.json() : {};
  } catch {
    return null;
  }
}

function available() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(Error('A porta 8765 está ocupada. Encerre o outro serviço e tente novamente.')),
    );
    server.listen(8765, '127.0.0.1', () => server.close(resolve));
  });
}

async function start({
  resources,
  dataDir,
  executable,
  version,
  spawnProcess = spawn,
  health = probe,
  portAvailable = available,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 90,
}) {
  const installation = identity(executable);
  const matches = (value) =>
    value?.ok === true &&
    value.service === 'jarvis' &&
    value.version === version &&
    value.installation === installation;
  const existing = await health();
  if (matches(existing)) return { reused: true, stop: async () => {} };
  if (existing)
    throw Error(
      'Existe outro backend na porta 8765. Encerre a outra instalação antes de continuar.',
    );
  await portAvailable();
  const child = spawnProcess(
    path.join(resources, 'backend', 'jarvis-backend.exe'),
    ['--parent', String(process.pid)],
    {
      cwd: resources,
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: { ...process.env, JARVIS_DATA_DIR: dataDir, JARVIS_INSTALLATION: installation },
    },
  );
  let failed = false,
    exited = false;
  child.once('error', () => {
    failed = true;
  });
  child.once('exit', () => {
    exited = true;
  });
  async function stop() {
    if (exited || failed) return;
    child.kill();
    for (let i = 0; i < 40 && !exited; i++) await wait(50);
    if (!exited) throw Error('O backend próprio não confirmou o encerramento.');
  }
  try {
    for (let i = 0; i < attempts; i++) {
      if (failed || exited)
        throw Error('O backend não iniciou. Verifique os arquivos do aplicativo e as permissões.');
      const value = await health();
      if (matches(value)) return { reused: false, stop };
      if (value) throw Error('A porta 8765 foi ocupada por outro serviço durante a inicialização.');
      await wait(500);
    }
    throw Error('O backend não ficou pronto em 45 segundos.');
  } catch (error) {
    await stop();
    throw error;
  }
}

module.exports = { start, identity, probe };

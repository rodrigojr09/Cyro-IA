const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const images = Object.freeze({
  javascript: 'node:24-alpine',
  python: 'python:3.12-alpine',
  shell: 'alpine:3.21',
});
function dockerArgs(name, folder, runtime, source) {
  if (
    !Object.hasOwn(images, runtime) ||
    typeof source !== 'string' ||
    !source.trim() ||
    Buffer.byteLength(source) > 32000
  )
    throw Error('Execução inválida.');
  const command =
    runtime === 'javascript'
      ? ['node', '-e', source]
      : runtime === 'python'
        ? ['python', '-c', source]
        : ['sh', '-lc', source];
  return [
    'run',
    '--rm',
    '--stop-timeout=1',
    '--name',
    name,
    '--pull=never',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=64',
    '--memory=128m',
    '--memory-swap=128m',
    '--cpus=1',
    '--user=65534:65534',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--tmpfs',
    '/work:rw,nosuid,size=16m',
    '--mount',
    `type=bind,source=${folder},target=/input,readonly`,
    '--workdir=/work',
    images[runtime],
    'sh',
    '-c',
    'cp -R /input/. /work/; exec timeout -s KILL 15 "$@"',
    'cyro',
    ...command,
  ];
}
function runProcess(args, { limit = 65536, timeout = 15000, spawnProcess = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, DOCKER_CONTEXT: 'default' };
    for (const name of [
      'DOCKER_HOST',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      'DOCKER_API_VERSION',
    ])
      delete environment[name];
    const child = spawnProcess('docker', args, {
      shell: false,
      windowsHide: true,
      env: environment,
    });
    let output = '',
      size = 0,
      limited = false,
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size <= limit) output += chunk.toString('utf8');
        else {
          limited = true;
          child.kill();
        }
      });
    child.once('error', (e) => {
      clearTimeout(timer);
      reject(
        Error(
          e.code === 'ENOENT'
            ? 'Docker Desktop não encontrado. Instale e inicie o Docker para executar.'
            : 'Não foi possível iniciar o contêiner.',
        ),
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, output, timedOut, outputLimited: limited });
    });
  });
}
async function runIsolated(request, { check = () => {}, spawnProcess = spawn } = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cyro-execution-'));
  await fs.chmod(folder, 0o755);
  const name = 'cyro-ev-' + randomUUID();
  try {
    let total = 0;
    if (!Array.isArray(request.files) || request.files.length > 30)
      throw Error('Arquivos da execução inválidos.');
    for (const f of request.files) {
      if (
        typeof f.name !== 'string' ||
        !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,99}$/.test(f.name) ||
        f.name.includes('..') ||
        f.name.endsWith('.') ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(f.name) ||
        typeof f.content !== 'string'
      )
        throw Error('Arquivo da execução inválido.');
      total += Buffer.byteLength(f.content);
      if (total > 256 * 1024) throw Error('Arquivos excedem limite.');
      await fs.writeFile(path.join(folder, f.name), f.content, { flag: 'wx', mode: 0o644 });
    }
    check();
    const result = await runProcess(dockerArgs(name, folder, request.runtime, request.source), {
      spawnProcess,
    });
    check();
    return result;
  } finally {
    // Killing the docker CLI alone does not stop its container.
    await runProcess(['rm', '--force', name], { timeout: 5000, spawnProcess }).catch(() => {});
    await fs.rm(folder, { recursive: true, force: true });
  }
}
module.exports = { dockerArgs, runIsolated, runProcess, images };

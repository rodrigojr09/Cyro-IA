const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { semver, compare, validSize, officialSetup } = require('./protocol');
const { receive, inspect } = require('./installer');
function metadata(row) {
  if (
    !row ||
    typeof row.private !== 'boolean' ||
    typeof row.id !== 'string' ||
    !/^[a-f\d-]{36}$/.test(row.id) ||
    !semver(row.version) ||
    semver(row.version).pre.length ||
    row.tag !== 'v' + row.version ||
    !officialSetup(row.setupUrl, row.tag) ||
    !/^[a-f0-9]{64}$/.test(row.checksum) ||
    !validSize(row.fileSize)
  )
    throw Error('Metadados de atualização inválidos.');
  return row;
}
function createUpdater({
  version,
  origin,
  directory,
  request = fetch,
  authorize,
  notify = () => {},
  verifySignature = async () => {
    throw Error('Validação Windows indisponível.');
  },
  install,
  openLink,
}) {
  let state = { phase: 'idle', installedVersion: version },
    available = null,
    file = null,
    pending = null;
  const journal = path.join(directory, 'install-pending.json');
  const publish = (patch) => {
    state = { ...state, ...patch };
    try {
      notify(state);
    } catch {
      /* A closing window must not abort package verification. */
    }
  };
  async function check() {
    if (pending || ['downloading', 'verifying', 'ready', 'installing'].includes(state.phase))
      return state;
    pending = (async () => {
      try {
        const response = await request(origin + '/api/updates/latest', {
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw Error('Não foi possível consultar atualizações.');
        const result = await response.json();
        available = result.release ? metadata(result.release) : null;
        let previous = null;
        try {
          if ((await fs.stat(journal)).size < 1024)
            previous = JSON.parse(await fs.readFile(journal, 'utf8'));
        } catch {
          /* No interrupted installation recorded. */
        }
        const incomplete =
          previous && semver(previous.version) && compare(version, previous.version) < 0;
        if (previous && !incomplete) await fs.rm(journal, { force: true });
        if (available && compare(available.version, version) > 0)
          publish({
            phase: 'available',
            release: available,
            error: incomplete
              ? 'A instalação anterior não foi concluída. Tente novamente ou use Link para Baixar.'
              : null,
          });
        else {
          available = null;
          publish({ phase: 'idle', release: null, error: null });
        }
      } catch {
        publish({
          phase: 'error',
          error: 'Não foi possível verificar atualizações. Tente novamente mais tarde.',
        });
      }
      return state;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  }
  async function destination() {
    if (!available) throw Error('Nenhuma atualização disponível.');
    const info = await authorize(available.id);
    const verified = metadata(info.metadata);
    if (
      verified.id !== available.id ||
      verified.checksum !== available.checksum ||
      verified.version !== available.version
    )
      throw Error('A publicação mudou. Verifique novamente.');
    const url = new URL(info.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.origin !== info.origin ||
      (!verified.private && !officialSetup(url.href, verified.tag))
    )
      throw Error('Destino de atualização inválido.');
    return url;
  }
  async function download() {
    if (
      pending ||
      !available ||
      ['downloading', 'verifying', 'ready', 'installing'].includes(state.phase)
    )
      return state;
    pending = (async () => {
      let folder;
      try {
        publish({ phase: 'preparing', error: null, progress: 0 });
        let url = await destination();
        await fs.mkdir(directory, { recursive: true });
        folder = await fs.mkdtemp(path.join(directory, 'package-'));
        file = path.join(folder, 'Setup.exe');
        publish({ phase: 'downloading' });
        let response;
        for (let redirects = 0; redirects < 4; redirects++) {
          response = await request(url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(30 * 60_000),
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const next = new URL(response.headers.get('location'), url);
          if (
            available.private ||
            next.protocol !== 'https:' ||
            ![
              'github.com',
              'release-assets.githubusercontent.com',
              'objects.githubusercontent.com',
            ].includes(next.hostname) ||
            next.username ||
            next.password
          )
            throw Error('Redirecionamento não permitido.');
          url = next;
        }
        if (
          !response.ok ||
          !response.body ||
          Number(response.headers.get('content-length')) !== available.fileSize
        )
          throw Error('Download inválido ou interrompido.');
        let last = 0;
        const checksum = await receive(
          Readable.fromWeb(response.body),
          file,
          available.fileSize,
          (done, total) => {
            if (Date.now() - last > 150 || done === total) {
              last = Date.now();
              publish({ progress: Math.floor((done / total) * 100) });
            }
          },
        );
        publish({ phase: 'verifying' });
        if (checksum !== available.checksum) throw Error('Checksum do instalador não confere.');
        await inspect(file, available.version);
        const signature = await verifySignature(file);
        if (!['Valid', 'NotSigned'].includes(signature))
          throw Error('Assinatura Windows inválida.');
        publish({ phase: 'ready', signature, progress: 100 });
      } catch {
        if (folder) await fs.rm(folder, { recursive: true, force: true });
        file = null;
        publish({
          phase: 'error',
          error:
            'Não foi possível baixar ou validar o instalador. Tente novamente ou use o link para baixar.',
        });
      }
      return state;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  }
  let installing = false;
  async function runInstall() {
    if (installing || state.phase !== 'ready' || !file) throw Error('Instalador não está pronto.');
    installing = true;
    try {
      // Recheck against changes between download and the install click.
      const hash = require('node:crypto').createHash('sha256');
      for await (const chunk of require('node:fs').createReadStream(file)) hash.update(chunk);
      if (hash.digest('hex') !== available.checksum)
        throw Error('O pacote foi alterado. Baixe novamente.');
      await inspect(file, available.version);
      if (!['Valid', 'NotSigned'].includes(await verifySignature(file)))
        throw Error('Assinatura Windows inválida.');
      await fs.writeFile(journal, JSON.stringify({ version: available.version }), { mode: 0o600 });
      if ((await install(file)) !== true) {
        await fs.rm(journal, { force: true });
        throw Error('Salve as alterações e conclua as mensagens antes de instalar.');
      }
      publish({ phase: 'installing' });
      return state;
    } finally {
      installing = false;
    }
  }
  return {
    state: () => state,
    check,
    download,
    install: runInstall,
    manual: async () => {
      await openLink((await destination()).href);
      return state;
    },
  };
}
module.exports = { createUpdater, metadata };

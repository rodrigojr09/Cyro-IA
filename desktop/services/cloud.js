const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
function parseActivation(value) {
  if (typeof value !== 'string' || value.length > 200) throw Error('Link de ativação inválido.');
  const url = new URL(value);
  if (
    url.protocol !== 'jarvis:' ||
    url.hostname !== 'activate' ||
    !['', '/'].includes(url.pathname) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    [...url.searchParams.keys()].join(',') !== 'token'
  )
    throw Error('Link de ativação inválido.');
  const token = url.searchParams.get('token');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Código de ativação inválido.');
  return token;
}
function cloudOrigin(value, packaged = true) {
  const url = new URL(value);
  if (
    (url.protocol !== 'https:' &&
      !(!packaged && url.protocol === 'http:' && url.hostname === 'localhost')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw Error('Configure uma origem Cloud HTTPS válida.');
  return url.origin;
}
function createCloud({ safeStorage, dataDir, origin, packaged = true, fetcher = fetch }) {
  const base = cloudOrigin(origin, packaged);
  const file = path.join(dataDir, 'cloud-credential.bin');
  let session = null;
  let state = { status: 'inactive', message: 'Ative esta instalação.' };
  async function persist() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(file + '.tmp', safeStorage.encryptString(JSON.stringify(session)), {
      mode: 0o600,
    });
    await fs.rename(file + '.tmp', file);
  }
  async function request(route, method = 'GET') {
    if (!session) throw Error('Ativação necessária.');
    try {
      const response = await fetcher(base + route, {
        method,
        redirect: 'error',
        headers: { Authorization: 'Bearer ' + session.credential },
        signal: AbortSignal.timeout(20000),
      });
      if ([401, 403].includes(response.status)) {
        state = {
          status: 'revoked',
          message: 'Licença expirada, revogada ou dispositivo bloqueado. Contate o administrador.',
        };
        throw Error(state.message);
      }
      if (!response.ok) throw Error('Cloud indisponível.');
      state = { status: 'active', message: 'Conectado ao JARVIS Cloud.' };
      return response.json();
    } catch (error) {
      if (state.status !== 'revoked')
        state = {
          status: 'offline',
          message: 'Sem conexão com o Cloud. Histórico local disponível.',
        };
      throw error;
    }
  }
  async function refresh() {
    if (!session) return state;
    await request('/api/device/session');
    if (new Date(session.expiresAt).getTime() - Date.now() < 7 * 86400000) {
      const next = await request('/api/device/session', 'POST');
      if (!/^[\w-]{43}$/.test(next.credential)) throw Error('Renovação inválida.');
      session = { ...session, credential: next.credential, expiresAt: next.expiresAt };
      await persist();
    }
    return state;
  }
  async function load() {
    if (!safeStorage.isEncryptionAvailable())
      throw Error('Proteção de credenciais do Windows indisponível.');
    try {
      const encrypted = await fs.readFile(file);
      session = JSON.parse(safeStorage.decryptString(encrypted));
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw Error('Não foi possível recuperar a credencial protegida.');
    }
    if (
      session &&
      (session.origin !== base ||
        !/^[\w-]{43}$/.test(session.credential) ||
        !/^[\w-]{36}$/.test(session.deviceId))
    )
      throw Error('Credencial incompatível com este Cloud.');
    return session;
  }
  async function activate(link, name) {
    const token = parseActivation(link);
    if (!safeStorage.isEncryptionAvailable()) throw Error('Proteção de credenciais indisponível.');
    if (session) throw Error('Instalação já ativada. Solicite suporte para reativar.');
    const deviceId = randomUUID();
    const response = await fetcher(base + '/api/activate', {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        deviceId,
        name: String(name).slice(0, 100) || 'JARVIS Desktop',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error('Ativação recusada. Confira o código, a validade e a conexão.');
    const value = await response.json();
    if (!/^[\w-]{43}$/.test(value.credential)) throw Error('Resposta de ativação inválida.');
    session = { origin: base, credential: value.credential, deviceId, expiresAt: value.expiresAt };
    await persist();
    state = { status: 'active', message: 'Instalação ativada.' };
    return session;
  }
  return { load, activate, refresh, request, state: () => state, current: () => session };
}
module.exports = { parseActivation, cloudOrigin, createCloud };

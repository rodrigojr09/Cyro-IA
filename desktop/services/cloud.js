const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
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
  const file = path.join(dataDir, 'cloud-session-v4.bin');
  let session = null;
  let state = { status: 'inactive', message: 'Entre com sua conta.' };
  async function persist() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(file + '.tmp', safeStorage.encryptString(JSON.stringify(session)), {
      mode: 0o600,
    });
    await fs.rename(file + '.tmp', file);
  }
  async function request(route, method = 'GET') {
    if (!session) throw Error('Entre com sua conta.');
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
          message: 'Sessão encerrada ou acesso bloqueado. Entre novamente.',
        };
        session = null;
        await fs.rm(file, { force: true });
        throw Error(state.message);
      }
      if (!response.ok) throw Error('Cloud indisponível.');
      const payload = await response.json();
      state = { status: 'active', message: 'Conectado ao JARVIS Cloud.' };
      return payload;
    } catch (error) {
      if (state.status !== 'revoked')
        state = {
          status: 'offline',
          message: 'Não foi possível validar a sessão. Verifique a conexão.',
        };
      throw error;
    }
  }
  async function refresh() {
    if (!session) return state;
    try {
      const result = await request('/api/device/session');
      if (result.active !== true) throw Error('Sessão não confirmada.');
      if (new Date(session.expiresAt).getTime() - Date.now() < 7 * 86400000) {
        const next = await request('/api/device/session', 'POST');
        if (!/^[\w-]{43}$/.test(next.credential) || !(Date.parse(next.expiresAt) > Date.now()))
          throw Error('Renovação inválida.');
        session = { ...session, credential: next.credential, expiresAt: next.expiresAt };
        await persist();
      }
      return state;
    } catch (error) {
      if (state.status !== 'revoked')
        state = {
          status: 'offline',
          message: 'Não foi possível validar a sessão. Verifique a conexão.',
        };
      throw error;
    }
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
    ) {
      session = null;
      throw Error('Sessão incompatível com este Cloud.');
    }
    return session;
  }
  async function login(input, name) {
    if (
      !input ||
      typeof input.email !== 'string' ||
      typeof input.password !== 'string' ||
      input.email.length > 254 ||
      input.password.length > 256
    )
      throw Error('Login inválido.');
    if (!safeStorage.isEncryptionAvailable()) throw Error('Proteção de credenciais indisponível.');
    const deviceId = session?.deviceId || randomUUID();
    const response = await fetcher(base + '/api/device/login', {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        deviceId,
        name: String(name).slice(0, 100) || 'JARVIS Desktop',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw Error('Login recusado. Confira e-mail, senha e acesso com o administrador.');
    const value = await response.json();
    if (!/^[\w-]{43}$/.test(value.credential) || !(Date.parse(value.expiresAt) > Date.now()))
      throw Error('Resposta de login inválida.');
    session = { origin: base, credential: value.credential, deviceId, expiresAt: value.expiresAt };
    await persist();
    state = { status: 'active', message: 'Conectado ao JARVIS Cloud.' };
    return session;
  }
  async function logout() {
    try {
      if (session) await request('/api/device/session', 'DELETE');
    } finally {
      session = null;
      state = { status: 'inactive', message: 'Entre com sua conta.' };
      await fs.rm(file, { force: true });
    }
  }
  return { load, login, logout, refresh, request, state: () => state, current: () => session };
}
module.exports = { cloudOrigin, createCloud };

// Route integration with an in-memory repository; no production database or paid API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash, passwordHash } from "../lib/crypto";
process.env.AUTH_SECRET = "test-session-secret-for-local-tests-only-123456";
const password = "password-for-test-only";
const user = {
  id: randomUUID(),
  name: "Test user",
  email: "user@example.test",
  role: "EMPLOYEE",
  status: "ACTIVE",
  passwordHash: await passwordHash(password),
  client: {} as object | null,
};
let device: any = null;
let sessions: any[] = [];
const fake: any = {
  user: {
    findUnique: async ({ where }: any) =>
      where.email && where.email !== user.email ? null : { ...user },
  },
  client: {
    upsert: async ({ where, create }: any) => {
      assert.equal(where.id, user.id);
      assert.equal(create.id, user.id);
      user.client ??= {};
      return user.client;
    },
  },
  device: {
    findUnique: async () => device,
    create: async ({ data }: any) =>
      (device = { ...data, id: randomUUID(), revokedAt: null }),
    update: async () => device,
  },
  session: {
    create: async ({ data }: any) => {
      sessions.push({ ...data, id: randomUUID() });
    },
    findUnique: async ({ where }: any) => {
      const row = sessions.find((row) => row.tokenHash === where.tokenHash);
      return row
        ? { ...row, device: row.deviceId ? device : null, user: { ...user } }
        : null;
    },
    deleteMany: async ({ where }: any) => {
      sessions = sessions.filter(
        (row) =>
          !Object.entries(where).every(([key, value]) => row[key] === value),
      );
    },
    updateMany: async ({ where, data }: any) => {
      const row = sessions.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  rateLimit: { upsert: async () => ({ count: 1 }) },
  auditLog: { create: async () => ({}) },
  $queryRaw: async () => [],
  $transaction: async (callback: any) => callback(fake),
};
(globalThis as any).jarvisDb = fake;
const { POST: login } = await import("../app/api/device/login/route");
const {
  GET: check,
  POST: renew,
  DELETE: logout,
} = await import("../app/api/device/session/route");
const input = (overrides = {}) =>
  new Request("https://jarvis.example.test/api/device/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password,
      deviceId: "11111111-1111-4111-8111-111111111111",
      name: "Test PC",
      ...overrides,
    }),
  });
const authorized = (credential: string) =>
  new Request("https://jarvis.example.test/api/device/session", {
    headers: { Authorization: `Bearer ${credential}` },
  });
test("rotas Desktop: senha, sessão, renovação, bloqueio e logout", async () => {
  assert.equal(
    (await login(input({ password: "wrong-password-value" }))).status,
    401,
  );
  assert.equal(
    (await login(input({ email: "unknown@example.test" }))).status,
    401,
  );
  user.status = "DISABLED";
  assert.equal((await login(input())).status, 401);
  user.status = "ACTIVE";
  user.role = "UNKNOWN";
  assert.equal((await login(input())).status, 401);
  user.role = "EMPLOYEE";
  const response = await login(input());
  assert.equal(response.status, 200);
  let { credential } = await response.json();
  assert.equal(credential.length, 43);
  assert.equal(sessions[0].tokenHash, hash(credential));
  assert.ok(!JSON.stringify(sessions).includes(credential));
  assert.ok(!JSON.stringify(sessions).includes(password));
  assert.equal((await check(authorized(credential))).status, 200);
  const old = credential;
  const renewed = await renew(authorized(old));
  assert.equal(renewed.status, 200);
  credential = (await renewed.json()).credential;
  assert.equal((await check(authorized(old))).status, 401);
  user.status = "DISABLED";
  assert.equal((await check(authorized(credential))).status, 401);
  user.status = "ACTIVE";
  device.revokedAt = new Date();
  assert.equal((await check(authorized(credential))).status, 401);
  device.revokedAt = null;
  sessions[0].expiresAt = new Date(0);
  assert.equal((await check(authorized(credential))).status, 401);
  sessions[0].expiresAt = new Date(Date.now() + 86400000);
  assert.equal((await logout(authorized(credential))).status, 200);
  assert.equal((await check(authorized(credential))).status, 401);
  assert.equal(
    (await check(new Request("https://jarvis.example.test"))).status,
    401,
  );
});

test("administradores sem perfil Desktop podem entrar, renovar e sair sem alterar seu papel", async () => {
  for (const role of ["ADMIN", "SUPER_ADMIN"]) {
    sessions = [];
    device = null;
    user.role = role;
    user.status = "ACTIVE";
    user.client = null;
    assert.equal(
      (await login(input({ password: "wrong-password-value" }))).status,
      401,
    );
    assert.equal(user.client, null);
    user.status = "DISABLED";
    assert.equal((await login(input())).status, 401);
    assert.equal(user.client, null);
    user.status = "ACTIVE";
    const result = await login(input());
    assert.equal(result.status, 200);
    let { credential } = await result.json();
    assert.ok(user.client);
    assert.equal(user.role, role);
    assert.equal((await check(authorized(credential))).status, 200);
    const renewed = await renew(authorized(credential));
    assert.equal(renewed.status, 200);
    const old = credential;
    credential = (await renewed.json()).credential;
    assert.equal((await check(authorized(old))).status, 401);
    user.status = "DISABLED";
    assert.equal((await check(authorized(credential))).status, 401);
    user.status = "ACTIVE";
    assert.equal((await logout(authorized(credential))).status, 200);
    assert.equal((await check(authorized(credential))).status, 401);
    const relogin = await login(input());
    assert.equal(relogin.status, 200);
    assert.equal(user.role, role);
  }
  user.role = "EMPLOYEE";
});

test("presence throttle preserves fresh authorization and never accepts a revoked session", async () => {
  const { deviceAuth } = await import("../lib/auth");
  const originalFind = fake.session.findUnique;
  const originalUpdate = fake.device.update;
  let updates = 0,
    checks = 0,
    revoked = false;
  const session = {
    id: "fixture-session",
    userId: user.id,
    tokenHash: "fixture",
    expiresAt: new Date(Date.now() + 86400000),
    device: {
      id: "fixture-device",
      userId: user.id,
      revokedAt: null,
      lastSeenAt: new Date(),
    },
    user: { ...user, status: "ACTIVE", client: {} },
  };
  fake.session.findUnique = async () => {
    checks++;
    return revoked ? null : session;
  };
  fake.device.update = async ({ data }: any) => {
    updates++;
    session.device.lastSeenAt = data.lastSeenAt;
    return session.device;
  };
  try {
    for (let i = 0; i < 10; i++) await deviceAuth(authorized("a".repeat(43)));
    assert.equal(updates, 0);
    assert.equal(checks, 10);
    session.device.lastSeenAt = new Date(Date.now() - 301000);
    await deviceAuth(authorized("a".repeat(43)));
    assert.equal(updates, 1);
    revoked = true;
    await assert.rejects(
      deviceAuth(authorized("a".repeat(43))),
      /inválida|bloqueado/,
    );
    assert.equal(checks, 12);
  } finally {
    fake.session.findUnique = originalFind;
    fake.device.update = originalUpdate;
  }
});

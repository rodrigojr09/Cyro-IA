import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  createProviderSettings,
  readProvider,
  openAISettings,
  sealProvider,
  unsealProvider,
  requireProviderAdmin,
  providerCommand,
} from "../lib/provider-settings";
import { createSpotifyService } from "../lib/spotify";
process.env.AUTH_SECRET =
  "provider-settings-test-master-secret-never-production";
process.env.APP_ORIGIN = "https://jarvis.example.test";
const apiKey = "sk-fixture-" + "a".repeat(30),
  clientSecret = "fixture-" + "b".repeat(30);
function fixture() {
  const rows: any = {
    openai: { id: "openai", revision: 0, ciphertext: null },
    spotify: { id: "spotify", revision: 0, ciphertext: null },
  };
  const audit: any[] = [];
  let connected = 0,
    pending = 0;
  const db: any = {
    providerConfiguration: {
      findUnique: async ({ where }: any) => ({ ...rows[where.id] }),
      update: async ({ where, data }: any) => {
        rows[where.id] = {
          ...rows[where.id],
          ciphertext: data.ciphertext,
          revision: rows[where.id].revision + 1,
        };
        return rows[where.id];
      },
    },
    auditLog: { create: async ({ data }: any) => audit.push(data) },
    spotifyConnection: { count: async () => connected },
    spotifyOAuthTransaction: {
      count: async () => pending,
      deleteMany: async () => {},
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => ({ ...data, id: "opaque-fixture" }),
    },
    $queryRaw: async () => [],
    $transaction: async (fn: any) => fn(db),
  };
  return {
    db,
    rows,
    audit,
    service: createProviderSettings(db),
    connected: (n: number) => (connected = n),
    pending: (n: number) => (pending = n),
  };
}
const openai = (revision = 0) => ({
  provider: "openai" as const,
  revision,
  enabled: true,
  apiKey,
  allowedModels: ["gpt-4.1-mini"],
  voiceEnabled: false,
});
const spotify = (revision = 0) => ({
  provider: "spotify" as const,
  revision,
  enabled: true,
  clientId: "a075ad4ae29f41c5a3df8d2ff9c84972",
  clientSecret,
  redirectUri: "https://jarvis.example.test/api/integrations/spotify/callback",
});
test("somente SUPER_ADMIN configura credenciais globais", () => {
  requireProviderAdmin({ role: "SUPER_ADMIN" });
  for (const role of ["ADMIN", "EMPLOYEE", ""])
    assert.throws(
      () => requireProviderAdmin({ role }),
      (e: any) => e.status === 403,
    );
});
test("salva OpenAI criptografado e retorna somente metadados mascarados", async () => {
  const f = fixture();
  await f.service.save("actor-fixture", openai());
  assert(!f.rows.openai.ciphertext.includes(apiKey));
  assert.equal(
    unsealProvider("openai", f.rows.openai.ciphertext).apiKey,
    apiKey,
  );
  const result = await f.service.status();
  assert.equal(result.openai.hasApiKey, true);
  assert.equal(result.openai.source, "dashboard");
  assert(!JSON.stringify(result).includes(apiKey));
  assert(!JSON.stringify(f.audit).includes(apiKey));
  assert.equal((await openAISettings(f.db)).apiKey, apiKey);
});
test("vazio mantém segredo; desabilitar é aplicado ao runtime sem apagar a chave", async () => {
  const f = fixture();
  await f.service.save("actor", openai());
  const { apiKey: ignored, ...change } = openai(1);
  await f.service.save("actor", { ...change, enabled: false });
  assert.equal((await openAISettings(f.db)).apiKey, "");
  assert.equal((await readProvider("openai", f.db)).data.apiKey, apiKey);
});
test("Spotify cria chave interna estável e alterações preservam tokens existentes", async () => {
  const f = fixture();
  await f.service.save("actor", spotify());
  const original = (await readProvider("spotify", f.db)).data;
  assert.match(original.tokenKey, /^[a-f0-9]{64}$/);
  await f.service.save("actor", { ...spotify(1), clientSecret: undefined });
  const updated = (await readProvider("spotify", f.db)).data;
  assert.equal(updated.tokenKey, original.tokenKey);
  assert.equal(updated.clientSecret, clientSecret);
  const status = await f.service.status();
  assert(!JSON.stringify(status).includes(original.tokenKey));
  assert(!JSON.stringify(status).includes(clientSecret));
  f.connected(1);
  await assert.rejects(
    f.service.save("actor", { ...spotify(2), clientId: "c".repeat(32) }),
    /Desconecte/,
  );
  f.connected(0);
  f.pending(1);
  await assert.rejects(
    f.service.save("actor", { ...spotify(2), clientId: "c".repeat(32) }),
    /Desconecte/,
  );
});
test("runtime Spotify recebe Client Secret da dashboard sem depender do env", async () => {
  const f = fixture();
  await f.service.save("actor", spotify());
  const native = createSpotifyService(f.db, async () => {
    throw Error("No remote calls");
  });
  const flow = await native.start("user-fixture", "session-fixture");
  assert.equal(
    new URL(flow.authorizationUrl).origin,
    "https://jarvis.example.test",
  );
  assert(!JSON.stringify(flow).includes(clientSecret));
});
test("revisão evita sobrescrever alteração concorrente", async () => {
  const f = fixture();
  await f.service.save("actor", openai());
  await assert.rejects(
    f.service.save("actor", openai()),
    (e: any) => e.status === 409,
  );
  assert.equal(f.audit.length, 1);
});
test("URL arbitrária, credenciais inválidas e campos extras são recusados", async () => {
  const f = fixture();
  await assert.rejects(
    f.service.save("actor", {
      ...spotify(),
      redirectUri: "https://evil.test/api/integrations/spotify/callback",
    }),
  );
  await assert.rejects(
    f.service.save("actor", {
      ...spotify(),
      redirectUri:
        "http://jarvis.example.test/api/integrations/spotify/callback",
    }),
  );
  await assert.rejects(
    f.service.save("actor", { ...openai(), apiKey: "not-a-key" }),
  );
  assert(
    !providerCommand.safeParse({ ...openai(), userId: "other-user" }).success,
  );
  assert.equal(f.audit.length, 0);
});
test("criptografia autentica provedor, conteúdo e chave do servidor", () => {
  const encrypted = sealProvider("spotify", { clientSecret });
  assert.throws(() => unsealProvider("openai", encrypted));
  assert.throws(() =>
    unsealProvider("spotify", encrypted.slice(0, -5) + "aaaaa"),
  );
  assert.notEqual(encrypted, sealProvider("spotify", { clientSecret }));
});
test("migration cria apenas duas configurações com revisão válida no Postgres", async () => {
  const sql = new PGlite();
  try {
    await sql.exec(
      await readFile(
        new URL(
          "../prisma/migrations/202610260002_provider_configuration/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const rows = await sql.query('SELECT * FROM "ProviderConfiguration"');
    assert.equal(rows.rows.length, 2);
    await assert.rejects(
      sql.exec(`INSERT INTO "ProviderConfiguration" (id) VALUES ('other')`),
    );
    await assert.rejects(
      sql.exec('UPDATE "ProviderConfiguration" SET revision=-1'),
    );
  } finally {
    await sql.close();
  }
});

test("primeiro salvamento adota a chave de tokens existente do ambiente", async () => {
  const original = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
  process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
  try {
    const f = fixture();
    f.connected(1);
    await f.service.save("actor", spotify());
    assert.equal(
      (await readProvider("spotify", f.db)).data.tokenKey,
      "ab".repeat(32),
    );
  } finally {
    if (original === undefined) delete process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
    else process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = original;
  }
});

test("missing credentials migration is reported as service setup, not role denial", async () => {
  await assert.rejects(
    readProvider("openai", {
      providerConfiguration: {
        findUnique: async () => {
          throw Object.assign(new Error("missing"), { code: "P2021" });
        },
      },
    }),
    /atualização do banco Cloud/,
  );
});

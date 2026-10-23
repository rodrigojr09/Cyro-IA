import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL: UTF-8 accounting, owner isolation, quota rollback, concurrent growth and cleanup recovery", async () => {
  const pg = new PGlite();
  let queue = Promise.resolve();
  const tx: any = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.reduce(
        (text, part, index) => text + (index ? "$" + index : "") + part,
        "",
      );
      return (await pg.query(sql, values)).rows;
    },
  };
  (globalThis as any).jarvisDb = {
    ...tx,
    $transaction: (callback: any) => {
      const run = queue.then(async () => {
        await pg.exec("BEGIN");
        try {
          const result = await callback(tx);
          await pg.exec("COMMIT");
          return result;
        } catch (error) {
          await pg.exec("ROLLBACK");
          throw error;
        }
      });
      queue = run.then(
        () => {},
        () => {},
      );
      return run;
    },
  };
  const { storageStatus, storageMutation, requireStorage } = await import(
    "../lib/storage"
  );
  try {
    await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
    for (const migration of [
      "20261022120000_cloud_chats",
      "20261022150000_local_attachment_notice",
      "20261023100000_storage_settings",
    ])
      await pg.exec(
        await readFile(
          new URL(
            "../prisma/migrations/" + migration + "/migration.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
    const a = randomUUID(),
      b = randomUUID(),
      chat = randomUUID();
    await pg.query('INSERT INTO "User" (id) VALUES ($1),($2)', [a, b]);
    assert.equal((await storageStatus(a)).limitBytes, 52428800);
    await pg.query(
      'UPDATE "User" SET "cloudStorageLimitBytes"=1048576 WHERE id=$1',
      [a],
    );
    await pg.query(
      'INSERT INTO "Conversation" (id,"userId",title,instructions) VALUES ($1,$2,$3,$4)',
      [chat, a, "Estudos", "Orientação"],
    );
    await pg.query(
      'INSERT INTO "ChatMessage" ("conversationId","requestId",role,content) VALUES ($1,$2,\'user\',$3)',
      [chat, randomUUID(), "Olá 🧠"],
    );
    const initial = await storageStatus(a);
    assert.equal(
      initial.usedBytes,
      128 + 64 + Buffer.byteLength("EstudosOrientaçãoOlá 🧠"),
    );
    assert.equal((await storageStatus(b)).usedBytes, 0);
    const insert = () =>
      storageMutation(
        a,
        async (client) =>
          client.$queryRaw`INSERT INTO "ChatMessage" ("conversationId","requestId",role,content) VALUES (${chat}::uuid,${randomUUID()}::uuid,'user',${"x".repeat(600000)}) RETURNING id`,
      );
    const results = await Promise.allSettled([insert(), insert()]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await pg.query('SELECT * FROM "ChatMessage"')).rows.length,
      2,
    );
    await pg.query(
      'UPDATE "ChatMessage" SET content=$1 WHERE "conversationId"=$2 AND content LIKE \'x%\'',
      ["x".repeat(1000000), chat],
    );
    assert.equal((await storageStatus(a)).blocked, true);
    process.env.AUTH_SECRET = "storage-test-only-secret-12345678901234567890";
    const fake = (globalThis as any).jarvisDb;
    fake.session = {
      findUnique: async () => ({
        id: "storage-session",
        userId: a,
        expiresAt: new Date(Date.now() + 3600000),
        user: { id: a, role: "ADMIN", status: "ACTIVE", client: {} },
        device: { id: randomUUID(), userId: a, revokedAt: null },
      }),
    };
    fake.device = { update: async () => ({}) };
    // No provider/configuration methods exist on this fixture: a skipped gate fails.
    for (const route of [
      "../app/api/v1/chat/completions/route",
      "../app/api/v1/audio/speech/route",
    ]) {
      const { POST } = await import(route);
      const response = await POST(
        new Request("https://example.test/api", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + "a".repeat(43),
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      );
      assert.equal(response.status, 507);
      assert.match((await response.json()).error, /Apague alguns chats/);
    }
    await assert.rejects(
      requireStorage(a),
      (error: any) => error.status === 507,
    );
    await assert.rejects(insert(), (error: any) => error.status === 507);
    await storageMutation(
      a,
      async (client) =>
        client.$queryRaw`DELETE FROM "Conversation" WHERE "userId"=${a}::uuid RETURNING id`,
    );
    assert.equal((await requireStorage(a)).usedBytes, 0);
    await assert.rejects(
      pg.query('UPDATE "User" SET "cloudStorageLimitBytes"=0 WHERE id=$1', [a]),
    );
  } finally {
    await pg.close();
  }
});

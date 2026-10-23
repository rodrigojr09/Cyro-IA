import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const rows: any[] = [],
  messages: any[] = [];
const userA = randomUUID(),
  userB = randomUUID();
let owner = userA;
const matches = (row: any, where: any) =>
  Object.entries(where).every(([key, value]) => row[key] === value);
const fake: any = {
  conversation: {
    deleteMany: async ({ where }: any) => {
      const ids = new Set(
        rows.filter((row) => matches(row, where)).map((row) => row.id),
      );
      for (let index = messages.length - 1; index >= 0; index--)
        if (ids.has(messages[index].conversationId)) messages.splice(index, 1);
      for (let index = rows.length - 1; index >= 0; index--)
        if (ids.has(rows[index].id)) rows.splice(index, 1);
      return { count: ids.size };
    },
    upsert: async ({ where, create, update }: any) => {
      let row = rows.find((row) => matches(row, where.userId_slot));
      if (!row) {
        row = {
          ...create,
          id: randomUUID(),
          archived: false,
          summary: "",
          createdAt: new Date(),
          lastMessageAt: null,
        };
        rows.push(row);
      } else Object.assign(row, update);
      return row;
    },
    findMany: async ({ where }: any) =>
      rows.filter((row) => matches(row, where)),
    findFirst: async ({ where }: any) =>
      rows.find((row) => matches(row, where)),
    createMany: async ({ data }: any) => {
      if (!rows.some((row) => row.id === data.id))
        rows.push({
          ...data,
          archived: false,
          summary: "",
          createdAt: new Date(),
          lastMessageAt: null,
        });
    },
    update: async ({ where, data }: any) => {
      const row = rows.find((row) => matches(row, where));
      Object.assign(
        row,
        Object.fromEntries(
          Object.entries(data).filter(([, value]) => value !== undefined),
        ),
      );
      return row;
    },
    delete: async ({ where }: any) => {
      rows.splice(
        rows.findIndex((row) => matches(row, where)),
        1,
      );
    },
  },
  chatMessage: {
    deleteMany: async ({ where }: any) => {
      for (let index = messages.length - 1; index >= 0; index--)
        if (matches(messages[index], where)) messages.splice(index, 1);
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }: any) =>
      messages.find((row) => matches(row, where.conversationId_requestId)),
    createMany: async ({ data }: any) => {
      if (
        messages.some(
          (row) =>
            row.conversationId === data.conversationId &&
            row.requestId === data.requestId,
        )
      )
        return { count: 0 };
      messages.push({
        ...data,
        id: messages.length + 1,
        createdAt: new Date(),
      });
      return { count: 1 };
    },
    findMany: async ({ where, take }: any) =>
      messages
        .filter(
          (row) =>
            row.conversationId === where.conversationId &&
            (!where.id || row.id < where.id.lt) &&
            (where.scope === undefined || row.scope === where.scope),
        )
        .reverse()
        .slice(0, take),
  },
  session: {
    findUnique: async ({ where }: any) =>
      where.tokenHash
        ? {
            id: "session",
            tokenHash: where.tokenHash,
            userId: owner,
            expiresAt: new Date(Date.now() + 86400000),
            device: { id: "device", userId: owner, revokedAt: null },
            user: { id: owner, role: "ADMIN", status: "ACTIVE", client: {} },
          }
        : null,
  },
  device: { update: async () => ({}) },
  rateLimit: { upsert: async () => ({ count: 1 }) },
  $queryRaw: async (sql: any, accountId: string) =>
    String(sql).includes("cloudStorageLimitBytes")
      ? [
          {
            limitBytes: 52428800,
            usedBytes:
              rows
                .filter((row) => row.userId === accountId)
                .reduce(
                  (sum, row) =>
                    sum +
                    Buffer.byteLength(row.title || "") +
                    Buffer.byteLength(row.summary || "") +
                    Buffer.byteLength(row.instructions || "") +
                    128,
                  0,
                ) +
              messages
                .filter((message) =>
                  rows.some(
                    (row) =>
                      row.id === message.conversationId &&
                      row.userId === accountId,
                  ),
                )
                .reduce(
                  (sum, row) =>
                    sum +
                    Buffer.byteLength(row.content || "") +
                    Buffer.byteLength(row.scope || "") +
                    64,
                  0,
                ),
          },
        ]
      : [],
  $transaction: async (callback: any) => callback(fake),
};
process.env.AUTH_SECRET = "test-conversation-secret-only-1234567890123456";
(globalThis as any).jarvisDb = fake;
const { POST } = await import("../app/api/device/chats/route");
async function call(command: object, authenticated = true) {
  return POST(
    new Request("https://example.test/api/device/chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Authorization: "Bearer " + "a".repeat(43) } : {}),
      },
      body: JSON.stringify(command),
    }),
  );
}

test("API: fixed Quick Chat, account isolation including admins, retry idempotency, pagination and validation", async () => {
  assert.equal((await call({ action: "list" }, false)).status, 401);
  const quick = await (await call({ action: "fixed", slot: "quick" })).json();
  assert.equal(
    (await (await call({ action: "fixed", slot: "quick" })).json()).id,
    quick.id,
  );
  const command = {
    action: "append",
    id: quick.id,
    requestId: randomUUID(),
    role: "user",
    content: "Private A",
    scope: "quick:general",
    attachmentCount: 2,
  };
  assert.equal((await call(command)).status, 200);
  await call(command);
  const history = await (
    await call({ action: "history", id: quick.id, limit: 100 })
  ).json();
  assert.equal(history.length, 1);
  assert.equal(history[0].attachment_count, 2);
  assert.equal(
    (await call({ ...command, requestId: randomUUID(), attachmentCount: 6 }))
      .status,
    400,
  );
  assert.equal(
    (await call({ ...command, requestId: randomUUID(), role: "assistant" }))
      .status,
    400,
  );
  assert.equal(
    (
      await (
        await call({
          action: "history",
          id: quick.id,
          limit: 100,
          before: history[0].id,
        })
      ).json()
    ).length,
    0,
  );
  assert.equal(
    (await call({ action: "change", id: quick.id, delete: true })).status,
    400,
  );
  assert.equal(
    (await call({ ...command, scope: "quick:project" })).status,
    400,
  );
  assert.equal(
    (
      await call({
        action: "create",
        title: "no paths",
        requestId: randomUUID(),
        project_id: randomUUID(),
      })
    ).status,
    400,
  );
  owner = userB;
  for (const action of ["get", "history", "append", "change"]) {
    const payload =
      action === "history"
        ? { limit: 100 }
        : action === "append"
          ? { requestId: randomUUID(), role: "user", content: "intrusion" }
          : action === "change"
            ? { title: "intrusion" }
            : {};
    assert.equal(
      (await call({ action, id: quick.id, ...payload })).status,
      404,
    );
  }
  assert.equal((await (await call({ action: "list" })).json()).length, 0);
  assert.notEqual(
    (await (await call({ action: "fixed", slot: "quick" })).json()).id,
    quick.id,
  );
  owner = userA;
  const requestId = randomUUID();
  const first = await (
    await call({ action: "create", title: "General", requestId })
  ).json();
  assert.equal(
    (
      await (
        await call({ action: "create", title: "General", requestId })
      ).json()
    ).id,
    first.id,
  );
});

test("API: instructions, archive/restore, clear fixed history and cloud cleanup stay within authenticated account", async () => {
  owner = userA;
  const first = await (
    await call({ action: "create", title: "Normal", requestId: randomUUID() })
  ).json();
  await call({
    action: "change",
    id: first.id,
    instructions: "Preferência de A",
    archived: true,
  });
  let row = await (await call({ action: "get", id: first.id })).json();
  assert.equal(row.instructions, "Preferência de A");
  assert.equal(row.archived, 1);
  await call({ action: "change", id: first.id, archived: false });
  const fixed = await (await call({ action: "fixed", slot: "quick" })).json();
  await call({
    action: "append",
    id: fixed.id,
    requestId: randomUUID(),
    role: "user",
    content: "Apagar depois",
  });
  await call({ action: "change", id: fixed.id, clear: true });
  assert.equal(
    (await (await call({ action: "history", id: fixed.id, limit: 100 })).json())
      .length,
    0,
  );
  owner = userB;
  const other = await (
    await call({
      action: "create",
      title: "Preservar B",
      requestId: randomUUID(),
    })
  ).json();
  owner = userA;
  assert.equal((await call({ action: "clear", confirmed: false })).status, 400);
  assert.equal((await call({ action: "clear", confirmed: true })).status, 200);
  assert.equal((await (await call({ action: "storage" })).json()).usedBytes, 0);
  owner = userB;
  row = await (await call({ action: "get", id: other.id })).json();
  assert.equal(row.title, "Preservar B");
  owner = userA;
});

test("PostgreSQL migration: unique fixed slots, message retries and cascading deletion", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
    await pg.exec(
      await readFile(
        new URL(
          "../prisma/migrations/20261022120000_cloud_chats/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await pg.exec(
      await readFile(
        new URL(
          "../prisma/migrations/20261023100000_storage_settings/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await pg.query('INSERT INTO "User" VALUES ($1)', [userA]);
    await pg.exec(
      await readFile(
        new URL(
          "../prisma/migrations/20261022150000_local_attachment_notice/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const chat = randomUUID(),
      request = randomUUID();
    await pg.query(
      "INSERT INTO \"Conversation\" (id,\"userId\",slot,title) VALUES ($1,$2,'quick','Quick')",
      [chat, userA],
    );
    await assert.rejects(
      pg.query(
        "INSERT INTO \"Conversation\" (id,\"userId\",slot,title) VALUES ($1,$2,'quick','Duplicate')",
        [randomUUID(), userA],
      ),
    );
    await pg.query(
      'INSERT INTO "ChatMessage" ("conversationId","requestId",role,content) VALUES ($1,$2,\'user\',\'Hi\')',
      [chat, request],
    );
    await assert.rejects(
      pg.query(
        'INSERT INTO "ChatMessage" ("conversationId","requestId",role,content) VALUES ($1,$2,\'user\',\'Again\')',
        [chat, request],
      ),
    );
    await pg.query(
      'UPDATE "ChatMessage" SET "localAttachmentCount"=5 WHERE "conversationId"=$1',
      [chat],
    );
    await assert.rejects(
      pg.query(
        'UPDATE "ChatMessage" SET "localAttachmentCount"=6 WHERE "conversationId"=$1',
        [chat],
      ),
    );
    await assert.rejects(
      pg.query(
        'UPDATE "ChatMessage" SET role=\'assistant\' WHERE "conversationId"=$1',
        [chat],
      ),
    );
    await pg.query('DELETE FROM "User" WHERE id=$1', [userA]);
    assert.equal(
      (await pg.query('SELECT * FROM "ChatMessage"')).rows.length,
      0,
    );
  } finally {
    await pg.close();
  }
});

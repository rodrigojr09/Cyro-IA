// Reproducible, local PostgreSQL benchmark. No production credentials or paid API.
import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const baseline = process.argv[2] || "f89f398";
const temporary = path.join(root, "cloud/lib/__benchmark_baseline.ts");
const pg = new PGlite();
let statements = 0,
  logical = 0;
const sql = async (text: string, values: any[] = []) => {
  statements++;
  return (await pg.query<any>(text, values)).rows;
};
const raw = async (parts: TemplateStringsArray, ...values: any[]) => {
  logical++;
  return sql(
    parts.reduce(
      (text, part, index) => text + (index ? "$" + index : "") + part,
      "",
    ),
    values,
  );
};
const whereSql = (where: any) => {
  const keys = Object.keys(where);
  if (keys.some((key) => !["id", "userId", "slot"].includes(key)))
    throw Error("Unexpected fixture predicate");
  return {
    text: keys.map((key, index) => `"${key}"=$${index + 1}`).join(" AND "),
    values: Object.values(where),
  };
};
const fake: any = {
  $queryRaw: raw,
  $transaction: async (callback: any) => {
    await sql("BEGIN");
    try {
      const result = await callback(fake);
      await sql("COMMIT");
      return result;
    } catch (error) {
      await sql("ROLLBACK");
      throw error;
    }
  },
  conversation: {
    findFirst: async ({ where }: any) => {
      logical++;
      const q = whereSql(where);
      return (
        await sql('SELECT * FROM "Conversation" WHERE ' + q.text, q.values)
      )[0];
    },
    findMany: async ({ where }: any) => {
      logical++;
      const q = whereSql(where);
      return sql(
        'SELECT * FROM "Conversation" WHERE ' +
          q.text +
          ' ORDER BY "lastMessageAt" DESC, "createdAt" DESC',
        q.values,
      );
    },
    upsert: async ({ create }: any) => {
      logical++;
      return (
        await sql(
          'INSERT INTO "Conversation" ("userId",slot,title) VALUES ($1,$2,$3) ON CONFLICT ("userId",slot) DO UPDATE SET archived=false RETURNING *',
          [create.userId, create.slot, create.title],
        )
      )[0];
    },
    update: async ({ where, data }: any) => {
      logical++;
      const keys = Object.keys(data).filter((k) => data[k] !== undefined);
      return (
        await sql(
          'UPDATE "Conversation" SET ' +
            keys.map((k, i) => `"${k}"=$${i + 1}`).join(",") +
            ` WHERE id=$${keys.length + 1} RETURNING *`,
          [...keys.map((k) => data[k]), where.id],
        )
      )[0];
    },
  },
  chatMessage: {
    findMany: async ({ where, take }: any) => {
      logical++;
      const values: any[] = [where.conversationId];
      let q = 'SELECT * FROM "ChatMessage" WHERE "conversationId"=$1';
      if (where.id) {
        values.push(where.id.lt);
        q += " AND id<$" + values.length;
      }
      if (where.scope !== undefined) {
        values.push(where.scope);
        q += " AND scope=$" + values.length;
      }
      values.push(take);
      return sql(q + " ORDER BY id DESC LIMIT $" + values.length, values);
    },
    createMany: async ({ data }: any) => {
      logical++;
      const rows = await sql(
        'INSERT INTO "ChatMessage" ("conversationId","requestId",role,content,scope,"localAttachmentCount") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("conversationId","requestId") DO NOTHING RETURNING id',
        [
          data.conversationId,
          data.requestId,
          data.role,
          data.content,
          data.scope,
          data.localAttachmentCount || 0,
        ],
      );
      return { count: rows.length };
    },
    findUniqueOrThrow: async ({ where }: any) => {
      logical++;
      const v = where.conversationId_requestId;
      return (
        await sql(
          'SELECT id FROM "ChatMessage" WHERE "conversationId"=$1 AND "requestId"=$2',
          [v.conversationId, v.requestId],
        )
      )[0];
    },
  },
};
(globalThis as any).jarvisDb = fake;
const owner = randomUUID(),
  other = randomUUID();
const ids = Array.from({ length: 5 }, () => randomUUID());
const scenarios = [
  {
    name: "A: startup",
    httpBefore: 4,
    httpAfter: 3,
    before: () => [
      { action: "fixed", slot: "general" },
      ...Array(3).fill({ action: "list" }),
    ],
    after: () => [
      { action: "fixed", slot: "general" },
      ...Array(2).fill({ action: "list" }),
    ],
  },
  {
    name: "B: 10min visible idle",
    httpBefore: 600,
    httpAfter: 20,
    before: () =>
      Array.from({ length: 300 }, () => [
        { action: "fixed", slot: "general" },
        { action: "list" },
      ]).flat(),
    after: () =>
      Array.from({ length: 10 }, () => [
        { action: "fixed", slot: "general" },
        { action: "list" },
      ]).flat(),
  },
  {
    name: "C: open main chat",
    httpBefore: 2,
    httpAfter: 2,
    before: () => [
      { action: "get", id: ids[0] },
      { action: "history", id: ids[0], limit: 100 },
    ],
  },
  {
    name: "D: five cold chats + return",
    httpBefore: 10,
    httpAfter: 10,
    before: () =>
      ids.flatMap((id) => [
        { action: "get", id },
        { action: "history", id, limit: 100 },
      ]),
  },
  {
    name: "E: ten messages + replies",
    httpBefore: 60,
    httpAfter: 60,
    before: () =>
      Array.from({ length: 10 }, () => [
        { action: "get", id: ids[0] },
        { action: "history", id: ids[0], limit: 20 },
        ...["user", "assistant"].map((role) => ({
          action: "append",
          id: ids[0],
          requestId: randomUUID(),
          role,
          content: "Synthetic benchmark text",
          scope: "",
        })),
        { action: "get", id: ids[0] },
        { action: "list" },
      ]).flat(),
  },
  {
    name: "F: open Quick",
    httpBefore: 3,
    httpAfter: 3,
    before: () => [
      { action: "fixed", slot: "quick" },
      { action: "get", id: ids[0] },
      { action: "history", id: ids[0], limit: 20 },
    ],
  },
  {
    name: "G: Writer existing local document",
    httpBefore: 0,
    httpAfter: 0,
    before: () => [],
  },
  {
    name: "H: switch local projects",
    httpBefore: 0,
    httpAfter: 0,
    before: () => [],
  },
  {
    name: "I: F5",
    httpBefore: 4,
    httpAfter: 3,
    before: () => [
      { action: "fixed", slot: "general" },
      ...Array(3).fill({ action: "list" }),
    ],
    after: () => [
      { action: "fixed", slot: "general" },
      ...Array(2).fill({ action: "list" }),
    ],
  },
  {
    name: "J: admin navigation",
    httpBefore: null,
    httpAfter: null,
    before: () => [],
  },
  {
    name: "K: Desktop + admin",
    httpBefore: null,
    httpAfter: null,
    before: () => [],
  },
];
try {
  await pg.exec(`CREATE TABLE "User" (id uuid PRIMARY KEY,"cloudStorageLimitBytes" integer DEFAULT 52428800);
 CREATE TABLE "Conversation" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"userId" uuid,slot text,title text,archived boolean DEFAULT false,summary text DEFAULT '',instructions text DEFAULT '',"createdAt" timestamptz DEFAULT now(),"lastMessageAt" timestamptz,UNIQUE("userId",slot));
 CREATE TABLE "ChatMessage" (id serial PRIMARY KEY,"conversationId" uuid,"requestId" uuid,role text,content text,scope text,"localAttachmentCount" integer DEFAULT 0,"createdAt" timestamptz DEFAULT now(),UNIQUE("conversationId","requestId"));`);
  await pg.query('INSERT INTO "User" (id) VALUES ($1),($2)', [owner, other]);
  for (const id of ids)
    await pg.query(
      'INSERT INTO "Conversation" (id,"userId",title) VALUES ($1,$2,$3)',
      [id, owner, "Synthetic chat"],
    );
  await pg.query(
    `INSERT INTO "Conversation" ("userId",slot,title) VALUES ($1,'general','General'),($1,'quick','Quick')`,
    [owner],
  );
  await writeFile(
    temporary,
    execFileSync("git", ["show", `${baseline}:cloud/lib/conversations.ts`], {
      cwd: root,
    }),
  );
  const old = await import(pathToFileURL(temporary).href);
  const current = await import("../lib/conversations");
  const results: any[] = [];
  for (const scenario of scenarios) {
    const result: any = {
      scenario: scenario.name,
      httpBefore: scenario.httpBefore,
      httpAfter: scenario.httpAfter,
    };
    for (const [label, mod, commands] of [
      ["before", old, scenario.before],
      ["after", current, scenario.after || scenario.before],
    ] as const) {
      // Reset only this in-memory fixture so both variants see identical data.
      await pg.exec('TRUNCATE "ChatMessage" RESTART IDENTITY');
      await pg.query(
        `UPDATE "Conversation" SET summary='', "lastMessageAt"=NULL`,
      );
      for (const id of ids)
        await pg.query(
          'INSERT INTO "ChatMessage" ("conversationId","requestId",role,content,scope) VALUES ($1,$2,$3,$4,$5)',
          [id, randomUUID(), "user", "Synthetic initial message", ""],
        );
      await pg.query('SELECT count(*) FROM "ChatMessage"');
      statements = 0;
      logical = 0;
      const durations: number[] = [];
      const started = performance.now();
      for (const command of commands()) {
        const at = performance.now();
        await mod.conversations(owner, command);
        durations.push(performance.now() - at);
      }
      durations.sort((a, b) => a - b);
      result[label] = {
        sql: statements,
        orm: logical,
        totalMs: performance.now() - started,
        p50: durations.length
          ? durations[Math.floor((durations.length - 1) * 0.5)]
          : null,
        p95: durations.length
          ? durations[Math.floor((durations.length - 1) * 0.95)]
          : null,
      };
    }
    result.measured =
      !scenario.name.startsWith("J:") && !scenario.name.startsWith("K:");
    result.sqlReduction = result.before.sql
      ? ((result.before.sql - result.after.sql) / result.before.sql) * 100
      : null;
    result.scope =
      "Local PGlite + instrumented repository; excludes auth, rate limit and provider billing. HTTP counts are scenario contract inputs, not a live-network capture. J/K not measured.";
    results.push(result);
  }
  const denied = await current
    .conversations(other, { action: "get", id: ids[0] })
    .then(
      () => false,
      () => true,
    );
  if (!denied) throw Error("Owner isolation failed");
  await mkdir(path.join(root, "build/v6"), { recursive: true });
  await writeFile(
    path.join(root, "build/v6/database-benchmark.json"),
    JSON.stringify({ baseline, results, isolation: denied }, null, 2),
  );
  console.log(
    JSON.stringify(
      results.map((r) => ({
        scenario: r.scenario,
        before: r.before.sql,
        after: r.after.sql,
        reduction: r.sqlReduction,
      })),
    ),
  );
} finally {
  await unlink(temporary).catch(() => {});
  await pg.close();
}

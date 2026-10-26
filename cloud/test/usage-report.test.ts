import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadUsageReport, usageFilters } from "../lib/usage-report";

const actor = { id: randomUUID(), role: "ADMIN" as const };
function fixture(count = 12) {
  const users = Array.from({ length: count }, (_, i) => ({
    userId: randomUUID(),
    _sum: {
      inputTokens: 1000 * (i + 1),
      outputTokens: 100,
      estimatedCost: i ? "0.002" : null,
    },
    _count: { _all: 40, estimatedCost: i ? 39 : 0 },
  }));
  const reads: any[] = [];
  const database = {
    usageLog: {
      groupBy: async (query: any) => {
        reads.push({ kind: "aggregate", ...query });
        return users;
      },
      findMany: async (query: any) => {
        reads.push({ kind: "recent", ...query });
        return Array.from({ length: query.take }, (_, i) => ({
          id: randomUUID(),
          userId: query.where.userId,
          model: "test-model",
          inputTokens: 10,
          outputTokens: 5,
          estimatedCost: null,
          createdAt: new Date("2026-10-26T12:00:00Z"),
          user: { name: "Usuário teste" },
        }));
      },
    },
    user: {
      findMany: async (query: any) => {
        reads.push({ kind: "profiles", ...query });
        return query.where.id.in.map((id: string) => ({
          id,
          name: "Usuário teste",
        }));
      },
    },
  } as unknown as Parameters<typeof loadUsageReport>[2];
  return { users, reads, database };
}

test("consumo agrega período completo e limita detalhes a cinco chamadas por usuário", async () => {
  const f = fixture();
  const report = await loadUsageReport(
    actor,
    new URLSearchParams(),
    f.database,
  );
  assert.equal(report.userCount, 12);
  assert.equal(report.users.length, 10);
  assert.equal(report.pages, 2);
  assert.equal(report.total.calls, 480);
  assert.equal(
    report.total.tokens,
    f.users.reduce(
      (sum, u) => sum + u._sum.inputTokens + u._sum.outputTokens,
      0,
    ),
  );
  assert.equal(report.users[0].tokens, 12100);
  assert.ok(report.users.every((u) => u.recent.length === 5));
  assert.equal(f.reads.filter((r) => r.kind === "recent").length, 10);
  for (const read of f.reads.filter((r) => r.kind !== "profiles"))
    assert.deepEqual(read.where.user, {
      managerId: actor.id,
      role: "EMPLOYEE",
    });
  assert.ok(
    f.reads
      .filter((r) => r.kind === "recent")
      .every((r) => r.take === 5 && r.orderBy.length === 2),
  );
});

test("paginação preserva totais, atende limites permitidos e não repete usuários", async () => {
  const f = fixture();
  const first = await loadUsageReport(actor, new URLSearchParams(), f.database);
  const second = await loadUsageReport(
    actor,
    new URLSearchParams("usagePage=2&perUser=20"),
    f.database,
  );
  assert.deepEqual(second.total, first.total);
  assert.equal(second.users.length, 2);
  assert.ok(
    second.users.every(
      (u) =>
        u.recent.length === 20 &&
        !first.users.some((a) => a.userId === u.userId),
    ),
  );
  const clamped = await loadUsageReport(
    actor,
    new URLSearchParams("usagePage=500&perUser=10"),
    f.database,
  );
  assert.equal(clamped.page, 2);
  assert.ok(clamped.users.every((u) => u.recent.length === 10));
});

test("mesmos filtros de usuário e UTC são aplicados aos gráficos e detalhes", async () => {
  const f = fixture(1);
  const id = f.users[0].userId;
  await loadUsageReport(
    actor,
    new URLSearchParams(`clientId=${id}&from=2026-10-01&to=2026-10-26`),
    f.database,
  );
  for (const read of f.reads.filter((r) => r.kind !== "profiles")) {
    assert.equal(read.where.userId, id);
    assert.equal(
      read.where.createdAt.gte.toISOString(),
      "2026-10-01T00:00:00.000Z",
    );
    assert.equal(
      read.where.createdAt.lte.toISOString(),
      "2026-10-26T23:59:59.999Z",
    );
    assert.deepEqual(read.where.user, {
      managerId: actor.id,
      role: "EMPLOYEE",
    });
  }
});

test("período vazio não busca detalhes; custos indisponíveis não viram custo zero", async () => {
  const empty = fixture(0);
  const report = await loadUsageReport(
    actor,
    new URLSearchParams(),
    empty.database,
  );
  assert.deepEqual(report.total, {
    inputTokens: 0,
    outputTokens: 0,
    tokens: 0,
    calls: 0,
  });
  assert.equal(empty.reads.length, 1);
  const f = fixture(1);
  const priced = await loadUsageReport(
    actor,
    new URLSearchParams(),
    f.database,
  );
  assert.equal(priced.users[0].cost, null);
  assert.equal(priced.users[0].unpricedCalls, 40);
  assert.equal(priced.users[0].recent[0].estimatedCost, null);
  assert.equal(priced.users[0].recent[0].createdAt, "2026-10-26T12:00:00.000Z");
});

test("SUPER_ADMIN mantém visão global sem ampliar o escopo de ADMIN", async () => {
  const f = fixture(1);
  await loadUsageReport(
    { ...actor, role: "SUPER_ADMIN" },
    new URLSearchParams(),
    f.database,
  );
  assert.deepEqual(f.reads[0].where.user, {});
});

test("filtros rejeitam datas inexistentes, períodos invertidos e limites excessivos", () => {
  for (const query of [
    "from=2026-02-30",
    "from=banana",
    "to=2026-13-01",
    "from=2026-10-26&to=2026-10-01",
    "clientId=outro",
    "perUser=100",
    "perUser=-1",
    "usagePage=0",
    "usagePage=1.5",
    "usagePage=Infinity",
  ])
    assert.throws(
      () => usageFilters(new URLSearchParams(query)),
      /Filtro de consumo inválido/,
    );
  assert.equal(usageFilters(new URLSearchParams()).limit, 5);
  assert.equal(
    usageFilters(
      new URLSearchParams("from=2024-02-29"),
    ).where.createdAt?.gte?.toISOString(),
    "2024-02-29T00:00:00.000Z",
  );
});

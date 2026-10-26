import { test } from "node:test";
import assert from "node:assert/strict";
import { createDashboardStore } from "../lib/dashboard-store";
test("dashboard shares cached data and deduplicates concurrent requests", async () => {
  let calls = 0;
  const store = createDashboardStore((async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return Response.json({ actor: { role: "SUPER_ADMIN" } });
  }) as typeof fetch);
  await Promise.all([store.load("/api/admin"), store.load("/api/admin")]);
  await store.load("/api/admin");
  assert.equal(calls, 1);
  assert.equal(
    (store.snapshot("/api/admin").data as any).actor.role,
    "SUPER_ADMIN",
  );
  await store.load("/api/admin", true);
  assert.equal(calls, 2);
});
test("dashboard isolates filtered resources and separate authenticated layouts", async () => {
  const request = (async (key: string) =>
    Response.json({ key })) as typeof fetch;
  const store = createDashboardStore(request);
  await store.load("/api/admin?from=2026-10-01");
  assert.equal(store.snapshot("/api/admin").data, null);
  assert.equal(
    createDashboardStore(request).snapshot("/api/admin?from=2026-10-01").data,
    null,
  );
});
test("dashboard distinguishes forbidden access from unavailable configuration and allows retry", async () => {
  let calls = 0;
  const store = createDashboardStore((async () => {
    calls++;
    return calls === 1
      ? Response.json({ error: "Migration necessária." }, { status: 503 })
      : Response.json({ ok: true });
  }) as typeof fetch);
  await store.load("/api/provider-settings");
  assert.equal(
    store.snapshot("/api/provider-settings").error,
    "Migration necessária.",
  );
  await store.load("/api/provider-settings");
  assert.equal(store.snapshot("/api/provider-settings").error, "");
  const denied = createDashboardStore((async () =>
    Response.json({ error: "denied" }, { status: 403 })) as typeof fetch);
  await denied.load("/api/provider-settings");
  assert.match(denied.snapshot("/api/provider-settings").error, /permissão/);
});
test("dashboard notifies subscribers and keeps last good data on refresh failure", async () => {
  let calls = 0,
    notices = 0;
  const store = createDashboardStore((async () => {
    if (++calls > 1) throw Error("Sem conexão.");
    return Response.json({ ok: true });
  }) as typeof fetch);
  const unsubscribe = store.subscribe("/api/admin", () => notices++);
  await store.load("/api/admin");
  await store.load("/api/admin", true);
  assert.deepEqual(store.snapshot("/api/admin").data, { ok: true });
  assert.equal(store.snapshot("/api/admin").error, "Sem conexão.");
  assert.ok(notices >= 4);
  unsubscribe();
});

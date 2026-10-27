import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestMetrics,
  metricIdentity,
  metricOperation,
  metricSql,
  metricCache,
} from "../lib/metrics";

test("metrics aggregate operations without SQL, body, token, URL parameters or raw identities", async () => {
  process.env.JARVIS_DB_METRICS = "1";
  process.env.JARVIS_DB_METRICS_SAMPLE = "1";
  const logs: any[] = [];
  const response = await requestMetrics(
    new Request("https://example.test/api/device/chats?secret=private", {
      method: "POST",
      headers: { Authorization: "Bearer private-token" },
      body: "private-message",
    }),
    async () => {
      metricIdentity("private-user", "private-session");
      await metricOperation("Conversation.findMany", async () =>
        metricSql("SELECT 'private-data'", 2),
      );
      await metricOperation("Conversation.findMany", async () =>
        metricSql("SELECT 'private-data'", 3),
      );
      metricCache(true);
      return new Response("ok");
    },
    (log) => logs.push(log),
  );
  assert.equal(response.status, 200);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].operations["Conversation.findMany"], 2);
  assert.equal(logs[0].sql.SELECT, 2);
  assert.equal(logs[0].sqlDurationMs, 5);
  assert.equal(logs[0].repeatedOperations, 1);
  assert.equal(logs[0].cacheHits, 1);
  assert.equal(JSON.stringify(logs).includes("private"), false);
  delete process.env.JARVIS_DB_METRICS;
  delete process.env.JARVIS_DB_METRICS_SAMPLE;
});

test("telemetry failure cannot block a successful request; disabled metrics emit nothing", async () => {
  process.env.JARVIS_DB_METRICS = "1";
  process.env.JARVIS_DB_METRICS_SAMPLE = "1";
  assert.equal(
    (
      await requestMetrics(
        new Request("https://example.test/unknown"),
        async () => new Response("ok"),
        () => {
          throw Error("log unavailable");
        },
      )
    ).status,
    200,
  );
  delete process.env.JARVIS_DB_METRICS;
  let emitted = false;
  await requestMetrics(
    new Request("https://example.test/"),
    async () => new Response("ok"),
    () => {
      emitted = true;
    },
  );
  assert.equal(emitted, false);
  delete process.env.JARVIS_DB_METRICS_SAMPLE;
});

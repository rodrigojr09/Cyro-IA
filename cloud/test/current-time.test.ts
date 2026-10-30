import { test } from "node:test";
import assert from "node:assert/strict";
import { currentTimeContext, withCurrentTime } from "../lib/current-time";
test("server date uses Sao Paulo even across a UTC day boundary", () => {
  const text = currentTimeContext(
    new Date("2026-10-30T01:30:00Z"),
    "America/Sao_Paulo",
  );
  assert.match(text, /29 de outubro de 2026/);
  assert.match(text, /22:30:00/);
  assert.match(text, /America\/Sao_Paulo/);
  assert.match(text, /2026-10-30T01:30:00.000Z/);
});
test("time is refreshed per request and invalid zone falls back without trusting conversation dates", () => {
  const old = currentTimeContext(
    new Date("2026-10-29T15:00:00Z"),
    "invalid-zone",
  );
  const current = currentTimeContext(
    new Date("2026-10-30T15:00:00Z"),
    "America/Sao_Paulo",
  );
  assert.match(old, /29 de outubro/);
  assert.match(current, /30 de outubro/);
  assert.notEqual(old, current);
  assert.match(current, /só afirme/);
});
test("clock context does not mutate or persist in caller history", () => {
  const history = [
    { role: "system", content: "Cyro" },
    { role: "user", content: "Que dia é hoje?" },
  ];
  const before = JSON.stringify(history);
  const messages = withCurrentTime(history, new Date("2026-10-30T15:00:00Z"));
  assert.equal(messages.at(-1)!.role, "system");
  assert.match(messages.at(-1)!.content as string, /30 de outubro/);
  assert.equal(JSON.stringify(history), before);
  assert.deepEqual(messages.slice(0, -1), history);
});

test("tool messages without text retain their call metadata", () => {
  const tool = { role: "assistant", tool_calls: [{ id: "call-1" }] };
  const rows = withCurrentTime([tool], new Date("2026-10-30T15:00:00Z"));
  assert.equal(rows[0], tool);
  assert.equal(rows.length, 2);
});

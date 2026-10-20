import { test } from "node:test";
import assert from "node:assert/strict";
import { canManage, canActivate } from "../lib/policy";
import { hash, token, passwordHash, passwordMatches } from "../lib/crypto";
import { body, HttpError, requireOrigin } from "../lib/http";
import { activateSchema, chatSchema } from "@jarvis/shared/schemas";
process.env.AUTH_SECRET = "test-only-secret-never-use-in-production-123456";
test("rodada de ferramentas aceita mensagem assistant sem conteúdo textual", () => {
  assert.ok(
    chatSchema.safeParse({
      model: "test",
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call",
              type: "function",
              function: { name: "list_processes", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call", content: "[]" },
      ],
    }).success,
  );
});
test("ADMIN gerencia apenas seus funcionários; funcionário não administra", () => {
  const employee = {
    id: "employee",
    role: "EMPLOYEE" as const,
    managerId: "admin",
  };
  assert.ok(canManage({ id: "admin", role: "ADMIN" }, employee));
  assert.ok(!canManage({ id: "other", role: "ADMIN" }, employee));
  assert.ok(!canManage({ id: "employee", role: "EMPLOYEE" }, employee));
  assert.ok(
    !canManage({ id: "admin", role: "ADMIN" }, { ...employee, role: "ADMIN" }),
  );
  assert.ok(canManage({ id: "root", role: "SUPER_ADMIN" }, employee));
});
test("ativação rejeita expiração, consumo e revogação", () => {
  const code = {
    revokedAt: null,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 10000),
    uses: 0,
    maxUses: 1,
  };
  assert.ok(canActivate(code));
  assert.ok(!canActivate({ ...code, expiresAt: new Date(0) }));
  assert.ok(!canActivate({ ...code, revokedAt: new Date() }));
  assert.ok(!canActivate({ ...code, consumedAt: new Date() }));
  assert.ok(!canActivate({ ...code, uses: 1 }));
});
test("tokens aleatórios e hashes autenticados não revelam originais", () => {
  const a = token();
  assert.equal(a.length, 43);
  assert.notEqual(a, token());
  assert.notEqual(hash(a), a);
  assert.equal(hash(a), hash(a));
});
test("senhas usam salt e verificação constante", async () => {
  const encoded = await passwordHash("password-for-test-only");
  assert.notEqual(encoded, await passwordHash("password-for-test-only"));
  assert.ok(await passwordMatches("password-for-test-only", encoded));
  assert.ok(!(await passwordMatches("wrong-password", encoded)));
});
test("schemas recusam consumo do cliente, ferramentas inválidas e campos extras", () => {
  assert.ok(
    !chatSchema.safeParse({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
      inputTokens: 0,
    }).success,
  );
  assert.ok(
    !chatSchema.safeParse({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 100000,
    }).success,
  );
  assert.ok(
    !activateSchema.safeParse({ token: "short", deviceId: "foo", name: "test" })
      .success,
  );
});
test("mutações web exigem origem e corpo limitado", async () => {
  process.env.APP_ORIGIN = "https://jarvis.example.test";
  assert.throws(
    () => requireOrigin(new Request("https://jarvis.example.test")),
    HttpError,
  );
  requireOrigin(
    new Request("https://jarvis.example.test", {
      headers: { origin: "https://jarvis.example.test" },
    }),
  );
  await assert.rejects(
    body(
      new Request("https://jarvis.example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '"' + "x".repeat(140000) + '"',
      }),
      activateSchema,
    ),
    (error: unknown) => error instanceof HttpError && error.status === 413,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { canUseDevice, type DeviceAccess } from "../lib/policy";
const now = new Date("2026-10-20T12:00:00Z");
function valid(): DeviceAccess {
  return {
    userId: "client-a",
    revokedAt: null,
    credentialExpiresAt: new Date("2027-01-01"),
    user: { role: "EMPLOYEE", status: "ACTIVE", client: {} },
    licenses: [
      {
        userId: "client-a",
        status: "ACTIVE",
        revokedAt: null,
        expiresAt: null,
      },
    ],
  };
}
test("cliente ativado com licença válida pode acessar; administrador sem Client não pode", () => {
  assert.ok(canUseDevice(valid(), now));
  assert.ok(!canUseDevice(null, now));
  assert.ok(
    !canUseDevice(
      { ...valid(), user: { ...valid().user, role: "ADMIN", client: null } },
      now,
    ),
  );
});
test("revogação de dispositivo, cliente ou credencial bloqueia acesso", () => {
  assert.ok(!canUseDevice({ ...valid(), revokedAt: now }, now));
  assert.ok(!canUseDevice({ ...valid(), credentialExpiresAt: now }, now));
  assert.ok(
    !canUseDevice(
      { ...valid(), user: { ...valid().user, status: "DISABLED" } },
      now,
    ),
  );
});
test("licença expirada/revogada ou pertencente a outro cliente nunca autoriza", () => {
  for (const license of [
    { ...valid().licenses[0], status: "SUSPENDED" },
    { ...valid().licenses[0], expiresAt: now },
    { ...valid().licenses[0], revokedAt: now },
    { ...valid().licenses[0], userId: "client-b" },
  ])
    assert.ok(!canUseDevice({ ...valid(), licenses: [license] }, now));
});

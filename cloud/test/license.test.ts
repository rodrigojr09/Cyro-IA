import { test } from "node:test";
import assert from "node:assert/strict";
import { canUseSession, type DesktopSession } from "../lib/policy";
const now = new Date("2026-10-22T12:00:00Z");
const valid = (): DesktopSession => ({
  userId: "a",
  expiresAt: new Date("2027-01-01"),
  user: { role: "EMPLOYEE", status: "ACTIVE", client: {} },
  device: { userId: "a", revokedAt: null },
});
test("login válido autoriza sem licença ou código de ativação", () => {
  assert.ok(canUseSession(valid(), now));
});
test("sessão ausente, expirada, usuário desativado e computador bloqueado impedem acesso", () => {
  assert.ok(!canUseSession(null, now));
  assert.ok(!canUseSession({ ...valid(), expiresAt: now }, now));
  assert.ok(!canUseSession({ ...valid(), device: null }, now));
  assert.ok(
    !canUseSession(
      { ...valid(), device: { userId: "a", revokedAt: now } },
      now,
    ),
  );
  assert.ok(
    !canUseSession(
      { ...valid(), device: { userId: "b", revokedAt: null } },
      now,
    ),
  );
  for (const user of [
    { ...valid().user, status: "DISABLED" },
    { ...valid().user, role: "UNKNOWN" },
    { ...valid().user, client: null },
  ])
    assert.ok(!canUseSession({ ...valid(), user }, now));
});

test("ADMIN e SUPER_ADMIN ativos usam Desktop sem mudar permissões do painel", () => {
  for (const role of ["ADMIN", "SUPER_ADMIN"]) {
    const session = { ...valid(), user: { ...valid().user, role } };
    assert.ok(canUseSession(session, now));
    assert.ok(
      !canUseSession(
        { ...session, user: { ...session.user, status: "DISABLED" } },
        now,
      ),
    );
    assert.ok(!canUseSession({ ...session, device: null }, now));
  }
});

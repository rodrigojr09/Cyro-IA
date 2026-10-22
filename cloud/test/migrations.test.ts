import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { resetCloud } from "../lib/reset-cloud";
test("migration aplica em PostgreSQL embarcado e consumo condicional concede uma única vez", async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(
      new URL(
        "../prisma/migrations/20261020190000_cloud_initial/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(
      await readFile(
        new URL(
          "../prisma/migrations/20261020200000_clients/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const adminId = randomUUID(),
      employeeId = randomUUID(),
      codeId = randomUUID();
    await db.query(
      'INSERT INTO "User" (id,name,email,role,"updatedAt") VALUES ($1,$2,$3,$4,NOW())',
      [adminId, "Test admin", "admin@example.test", "SUPER_ADMIN"],
    );
    await db.query(
      'INSERT INTO "User" (id,name,email,role,"updatedAt") VALUES ($1,$2,$3,$4,NOW())',
      [employeeId, "Test employee", "employee@example.test", "EMPLOYEE"],
    );
    await db.query('INSERT INTO "Client" (id,"updatedAt") VALUES ($1,NOW())', [
      employeeId,
    ]);
    await assert.rejects(
      db.query('UPDATE "Client" SET "maxDevices"=0 WHERE id=$1', [employeeId]),
    );
    await db.query(
      'INSERT INTO "ActivationCode" (id,"tokenHash","createdById","assignedUserId","expiresAt") VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'1 hour\')',
      [codeId, "test-hash-not-a-token", adminId, employeeId],
    );
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.query(
          'UPDATE "ActivationCode" SET uses=1,"consumedAt"=NOW() WHERE id=$1 AND uses=0 AND "maxUses"=1 AND "consumedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">NOW() RETURNING id',
          [codeId],
        ),
      ),
    );
    assert.equal(
      results.reduce((total, result) => total + result.rows.length, 0),
      1,
    );
    await assert.rejects(
      db.query('UPDATE "ActivationCode" SET "maxUses"=2 WHERE id=$1', [codeId]),
    );
    await assert.rejects(
      db.query(
        'INSERT INTO "UsageBudget" ("userId",period,charged,reserved) VALUES ($1,$2,-1,0)',
        [employeeId, "2026-10"],
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../prisma/migrations/20261022000000_desktop_login/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const revoked = await db.query<{ revokedAt: Date }>(
      'SELECT "revokedAt" FROM "ActivationCode" WHERE id=$1',
      [codeId],
    );
    assert.ok(revoked.rows[0].revokedAt);
    const deviceId = randomUUID(),
      sessionId = randomUUID();
    await db.query(
      'INSERT INTO "Device" (id,"userId","deviceId",name) VALUES ($1,$2,$3,$4)',
      [deviceId, employeeId, randomUUID(), "Test computer"],
    );
    await db.query(
      'INSERT INTO "Session" (id,"userId","deviceId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'1 day\')',
      [sessionId, employeeId, deviceId, "session-hash"],
    );
    await assert.rejects(
      db.query(
        'INSERT INTO "Session" (id,"userId","deviceId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,NOW())',
        [randomUUID(), adminId, deviceId, "wrong-owner"],
      ),
    );
    await db.query('DELETE FROM "Session" WHERE "userId"=$1', [employeeId]);
    assert.equal(
      (await db.query('SELECT id FROM "Session" WHERE id=$1', [sessionId])).rows
        .length,
      0,
    );
    await db.query('UPDATE "User" SET "passwordHash"=$1 WHERE id=$2', [
      "test-only-placeholder",
      adminId,
    ]);
    await db.query(
      'INSERT INTO "UsageLog" (id,"userId","deviceId",model,"inputTokens","outputTokens") VALUES ($1,$2,$3,$4,10,20)',
      [randomUUID(), employeeId, deviceId, "test-model"],
    );
    await db.query(
      'INSERT INTO "AuditLog" (id,"actorId",action,"targetType") VALUES ($1,$2,$3,$4)',
      [randomUUID(), adminId, "test", "Test"],
    );
    // The same Client/Device foreign keys must support administrative Desktop accounts.
    await db.query('INSERT INTO "Client" (id,"updatedAt") VALUES ($1,NOW())', [
      adminId,
    ]);
    const adminDeviceId = randomUUID();
    await db.query(
      'INSERT INTO "Device" (id,"userId","deviceId",name) VALUES ($1,$2,$3,$4)',
      [adminDeviceId, adminId, randomUUID(), "Admin PC"],
    );
    await db.query(
      'INSERT INTO "Session" (id,"userId","deviceId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'1 day\')',
      [randomUUID(), adminId, adminDeviceId, "admin-desktop-session"],
    );
    await db.exec("BEGIN");
    try {
      const result = await resetCloud({
        $executeRawUnsafe: async (query) => db.exec(query),
        $queryRawUnsafe: async <T>(query: string): Promise<T> =>
          (await db.query(query)).rows as T,
      });
      assert.equal(result.before.administrators, 1);
      assert.equal(result.before.users, 1);
      assert.equal(result.after.administrators, 1);
      assert.equal(result.after.users, 0);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    assert.equal((await db.query('SELECT id FROM "User"')).rows.length, 1);
    assert.equal(
      (await db.query('SELECT id FROM "User" WHERE id=$1', [adminId])).rows
        .length,
      1,
    );
    assert.equal((await db.query('SELECT id FROM "AuditLog"')).rows.length, 0);
  } finally {
    await db.close();
  }
});

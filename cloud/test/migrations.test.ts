import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
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
  } finally {
    await db.close();
  }
});

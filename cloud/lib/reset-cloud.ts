// Explicit owner maintenance only. Never exposed as an HTTP endpoint.
export interface ResetConnection {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe<T>(query: string): Promise<T>;
}
export const resetSummarySQL = `SELECT
  (SELECT COUNT(*)::int FROM "User" WHERE role IN ('ADMIN', 'SUPER_ADMIN')) AS administrators,
  (SELECT COUNT(*)::int FROM "User" WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' AND "passwordHash" IS NOT NULL) AS "usableOwners",
  (SELECT COUNT(*)::int FROM "User" WHERE role = 'EMPLOYEE') AS users,
  (SELECT COUNT(*)::int FROM "Device") AS devices,
  (SELECT COUNT(*)::int FROM "Session") AS sessions,
  (SELECT COUNT(*)::int FROM "UsageLog") AS usage`;
export async function resetCloud(tx: ResetConnection) {
  await tx.$executeRawUnsafe(
    'LOCK TABLE "User", "Client", "Device", "Session", "UsageLog", "UsageBudget", "AuditLog", "License", "ActivationCode", "RateLimit" IN ACCESS EXCLUSIVE MODE',
  );
  const [before] =
    await tx.$queryRawUnsafe<
      {
        administrators: number;
        usableOwners: number;
        users: number;
        devices: number;
        sessions: number;
        usage: number;
      }[]
    >(resetSummarySQL);
  if (!before?.usableOwners)
    throw Error(
      "Limpeza recusada: é necessário preservar um SUPER_ADMIN ativo com senha.",
    );
  for (const table of [
    "UsageLog",
    "UsageBudget",
    "AuditLog",
    "Session",
    "License",
    "ActivationCode",
    "Device",
    "Client",
    "RateLimit",
  ]) {
    // Table names are fixed in source; no user input is interpolated.
    await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
  await tx.$executeRawUnsafe(
    `UPDATE "User" SET "managerId" = NULL WHERE "managerId" IN (SELECT id FROM "User" WHERE role = 'EMPLOYEE')`,
  );
  await tx.$executeRawUnsafe(`DELETE FROM "User" WHERE role = 'EMPLOYEE'`);
  const [after] = await tx.$queryRawUnsafe<(typeof before)[]>(resetSummarySQL);
  if (
    after.administrators !== before.administrators ||
    after.usableOwners !== before.usableOwners ||
    after.users ||
    after.devices ||
    after.sessions ||
    after.usage
  )
    throw Error(
      "Verificação da limpeza falhou; a transação deve ser revertida.",
    );
  return { before, after };
}

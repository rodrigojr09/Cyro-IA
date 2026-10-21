import "dotenv/config";
import { db } from "../lib/db";
import { passwordHash } from "../lib/crypto";
import { loginSchema } from "@jarvis/shared/schemas";
try {
  const input = loginSchema.parse({
    email: process.env.BOOTSTRAP_EMAIL,
    password: process.env.BOOTSTRAP_PASSWORD,
  });
  const name = process.env.BOOTSTRAP_NAME?.trim();
  if (!name || name.length > 100) throw Error("Configure BOOTSTRAP_NAME.");
  const encoded = await passwordHash(input.password);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(31000001)`;
    if (await tx.user.count({ where: { role: "SUPER_ADMIN" } }))
      throw Error("Administrador inicial já existe.");
    const user = await tx.user.create({
      data: {
        email: input.email,
        name,
        passwordHash: encoded,
        role: "SUPER_ADMIN",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "admin.bootstrap",
        targetType: "User",
        targetId: user.id,
      },
    });
  });
  console.log("Administrador inicial criado. Remova BOOTSTRAP_* do ambiente.");
} catch {
  console.error(
    "Bootstrap recusado. Verifique configuração, conexão e existência de administrador; nenhum segredo será exibido.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

import { z } from "zod";
import { loginSchema } from "@jarvis/shared/schemas";
import { db } from "@/lib/db";
import { body, endpoint, HttpError } from "@/lib/http";
import { hash, token, passwordMatches, passwordHash } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { canLoginDesktop } from "@/lib/policy";
let dummy: Promise<string> | undefined;
const schema = loginSchema.extend({
  deviceId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});
export const POST = endpoint(async (request) => {
  await rateLimit("desktop-login:global", 100, 60);
  const input = await body(request, schema);
  await rateLimit(`desktop-login:${input.email}`, 5, 300);
  const user = await db.user.findUnique({
    where: { email: input.email },
    include: { client: true },
  });
  dummy ??= passwordHash(token());
  const matches = await passwordMatches(
    input.password,
    user?.passwordHash ?? (await dummy),
  );
  if (!matches || !user || !canLoginDesktop(user))
    throw new HttpError(
      401,
      "E-mail, senha ou acesso inválido. Contate o administrador.",
    );
  const credential = token(),
    expiresAt = new Date(Date.now() + 90 * 86400000);
  await db.$transaction(async (tx) => {
    // Serialize login against administrative access changes.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (
      !current ||
      !canLoginDesktop(current) ||
      current.passwordHash !== user.passwordHash
    )
      throw new HttpError(401, "Acesso alterado. Entre novamente.");
    // All active roles can use Desktop. Provision its profile only after password verification.
    await tx.client.upsert({
      where: { id: user.id },
      create: { id: user.id },
      update: {},
    });
    let device = await tx.device.findUnique({
      where: { deviceId: input.deviceId },
    });
    if (device && (device.userId !== user.id || device.revokedAt))
      throw new HttpError(
        403,
        "Computador bloqueado ou vinculado a outro usuário.",
      );
    if (!device)
      device = await tx.device.create({
        data: {
          userId: user.id,
          deviceId: input.deviceId,
          name: input.name,
        },
      });
    await tx.session.deleteMany({ where: { deviceId: device.id } });
    await tx.session.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        tokenHash: hash(credential),
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "desktop.login",
        targetType: "Device",
        targetId: device.id,
      },
    });
  });
  return Response.json(
    { credential, expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
});

import { db } from "./db";
import { hash, token } from "./crypto";
import { HttpError } from "./http";
import { canManage } from "./policy";
import type { Actor } from "./policy";
export async function generateActivation(
  actor: Actor,
  userId: string,
  hours: number,
) {
  const value = token();
  const row = await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !canManage(actor, user) ||
      user.role !== "EMPLOYEE" ||
      user.status !== "ACTIVE"
    )
      throw new HttpError(403, "Funcionário fora do escopo ou inativo.");
    const code = await tx.activationCode.create({
      data: {
        tokenHash: hash(value),
        createdById: actor.id,
        assignedUserId: userId,
        expiresAt: new Date(Date.now() + hours * 3600000),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "activation.created",
        targetType: "ActivationCode",
        targetId: code.id,
      },
    });
    return code;
  });
  return {
    id: row.id,
    token: value,
    link: `jarvis://activate?token=${value}`,
    expiresAt: row.expiresAt,
  };
}
export async function consumeActivation(input: {
  token: string;
  deviceId: string;
  name: string;
}) {
  const credential = token();
  return db.$transaction(
    async (tx) => {
      const code = await tx.activationCode.findUnique({
        where: { tokenHash: hash(input.token) },
        include: { assignedUser: true, createdBy: true },
      });
      const user = code?.assignedUser;
      const now = new Date();
      if (
        !code ||
        !user ||
        user.status !== "ACTIVE" ||
        user.role !== "EMPLOYEE" ||
        code.createdBy.status !== "ACTIVE" ||
        !canManage(code.createdBy, user)
      )
        throw new HttpError(400, "Código inválido ou indisponível.");
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${user.id}::uuid FOR UPDATE`;
      const client = await tx.client.findUnique({ where: { id: user.id } });
      if (
        !client ||
        (await tx.device.count({
          where: { userId: user.id, revokedAt: null },
        })) >= client.maxDevices
      )
        throw new HttpError(403, "Limite de dispositivos do cliente atingido.");
      // Conditional UPDATE acquires the row lock; only one concurrent consumer wins.
      const claimed = await tx.activationCode.updateMany({
        where: {
          id: code.id,
          revokedAt: null,
          consumedAt: null,
          expiresAt: { gt: now },
          uses: 0,
          maxUses: 1,
        },
        data: { uses: 1, consumedAt: now },
      });
      if (claimed.count !== 1)
        throw new HttpError(400, "Código inválido ou indisponível.");
      if (await tx.device.findUnique({ where: { deviceId: input.deviceId } }))
        throw new HttpError(409, "Instalação já cadastrada. Solicite suporte.");
      const expiresAt = new Date(Date.now() + 90 * 86400000);
      const device = await tx.device.create({
        data: {
          userId: user.id,
          deviceId: input.deviceId,
          name: input.name,
          credentialHash: hash(credential),
          credentialExpiresAt: expiresAt,
        },
      });
      await tx.license.create({
        data: { userId: user.id, deviceId: device.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "activation.consumed",
          targetType: "Device",
          targetId: device.id,
        },
      });
      return {
        credential,
        expiresAt: expiresAt.toISOString(),
        user: { id: user.id, name: user.name },
      };
    },
    { isolationLevel: "Serializable" },
  );
}

import { z } from "zod";
import { admin } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage, scope } from "@/lib/policy";
import { body, endpoint, HttpError, requireOrigin } from "@/lib/http";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("license.update"),
      id: z.string().uuid(),
      status: z.enum(["ACTIVE", "SUSPENDED"]),
      expiresAt: z.string().datetime().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("client.devices"),
      id: z.string().uuid(),
      maxDevices: z.number().int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("settings.update"),
      intelligenceEnabled: z.boolean(),
      maxOutputTokens: z.number().int().min(100).max(3500),
    })
    .strict(),
]);
export const GET = endpoint(async () => {
  const actor = await admin();
  const licenses = await db.license.findMany({
    where: { user: scope(actor) },
    include: {
      device: { select: { name: true, revokedAt: true } },
      user: { select: { name: true } },
    },
    take: 100,
    orderBy: { createdAt: "desc" },
  });
  const clients = await db.client.findMany({
    where: { user: scope(actor) },
    include: { user: { select: { name: true } } },
    take: 100,
  });
  const settings =
    actor.role === "SUPER_ADMIN"
      ? await db.systemSettings.findUnique({ where: { id: "global" } })
      : null;
  return Response.json({
    licenses,
    clients,
    settings: settings ?? { intelligenceEnabled: true, maxOutputTokens: 3500 },
    canConfigure: actor.role === "SUPER_ADMIN",
  });
});
export const POST = endpoint(async (request) => {
  requireOrigin(request);
  const actor = await admin();
  const input = await body(request, schema);
  await db.$transaction(async (tx) => {
    if (input.action === "settings.update") {
      if (actor.role !== "SUPER_ADMIN")
        throw new HttpError(
          403,
          "Somente SUPER_ADMIN altera configurações globais.",
        );
      const data = {
        intelligenceEnabled: input.intelligenceEnabled,
        maxOutputTokens: input.maxOutputTokens,
      };
      await tx.systemSettings.upsert({
        where: { id: "global" },
        create: { id: "global", ...data },
        update: data,
      });
    } else if (input.action === "license.update") {
      const license = await tx.license.findUnique({
        where: { id: input.id },
        include: { user: true, device: true },
      });
      if (!license || !canManage(actor, license.user))
        throw new HttpError(403, "Licença fora do escopo.");
      if (input.status === "ACTIVE" && license.device.revokedAt)
        throw new HttpError(
          409,
          "Dispositivo bloqueado; não é possível reativar sua licença.",
        );
      await tx.license.update({
        where: { id: input.id },
        data: {
          status: input.status,
          revokedAt: input.status === "SUSPENDED" ? new Date() : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
    } else {
      const user = await tx.user.findUnique({ where: { id: input.id } });
      if (!user || !canManage(actor, user))
        throw new HttpError(403, "Cliente fora do escopo.");
      await tx.client.update({
        where: { id: input.id },
        data: { maxDevices: input.maxDevices },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: input.action,
        targetType: input.action.split(".")[0],
        targetId: "id" in input ? input.id : "global",
      },
    });
  });
  return Response.json({ ok: true });
});

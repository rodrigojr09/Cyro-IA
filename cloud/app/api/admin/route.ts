import { z } from "zod";
import { employeeSchema } from "@jarvis/shared/schemas";
import { db } from "@/lib/db";
import { admin } from "@/lib/auth";
import { canManage, scope } from "@/lib/policy";
import { body, endpoint, HttpError, requireOrigin } from "@/lib/http";
import { passwordHash } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("client.create"),
      data: employeeSchema.extend({
        password: z.string().min(12).max(256),
      }),
    })
    .strict(),
  z
    .object({
      action: z.literal("client.update"),
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(100),
      status: z.enum(["ACTIVE", "DISABLED"]),
      monthlyTokenLimit: z.number().int().min(0).max(100000000),
      password: z.string().min(12).max(256).optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("device.revoke"), id: z.string().uuid() })
    .strict(),
]);
export const GET = endpoint(async (request) => {
  const query = new URL(request.url).searchParams;
  const from = query.get("from"),
    to = query.get("to"),
    clientId = query.get("clientId");
  if (
    (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
    (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) ||
    (clientId && !z.string().uuid().safeParse(clientId).success)
  )
    throw new HttpError(400, "Filtro inválido.");
  const usageFilter = {
    ...(clientId ? { userId: clientId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from + "T00:00:00Z") } : {}),
            ...(to ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
          },
        }
      : {}),
  };
  const actor = await admin();
  const employees = await db.user.findMany({
    where: { ...scope(actor) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      monthlyTokenLimit: true,
      managerId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const userScope = scope(actor);
  const [devices, usage, audit] = await Promise.all([
    db.device.findMany({
      where: { user: userScope },
      select: {
        id: true,
        userId: true,
        name: true,
        lastSeenAt: true,
        revokedAt: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.usageLog.findMany({
      where: { user: userScope, ...usageFilter },
      select: {
        id: true,
        userId: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCost: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.auditLog.findMany({
      where: actor.role === "SUPER_ADMIN" ? {} : { actorId: actor.id },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const month = new Date(
    new Date().toISOString().slice(0, 7) + "-01T00:00:00.000Z",
  );
  const [total, active, authorized, monthly] = await Promise.all([
    db.user.count({ where: { ...userScope, role: "EMPLOYEE" } }),
    db.user.count({
      where: { ...userScope, role: "EMPLOYEE", status: "ACTIVE" },
    }),
    db.device.count({
      where: {
        revokedAt: null,
        user: { ...userScope, status: "ACTIVE" },
      },
    }),
    db.usageLog.aggregate({
      where: { user: userScope, createdAt: { gte: month } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
    }),
  ]);
  return Response.json({
    actor: { name: actor.name, role: actor.role },
    employees,
    devices,
    usage,
    audit,
    metrics: {
      employees: total,
      active,
      devices: authorized,
      tokens:
        (monthly._sum.inputTokens ?? 0) + (monthly._sum.outputTokens ?? 0),
      cost: monthly._sum.estimatedCost,
    },
  });
});
export const POST = endpoint(async (request) => {
  requireOrigin(request);
  const actor = await admin();
  await rateLimit(`admin:${actor.id}`, 60, 60);
  const input = await body(request, command);
  await db.$transaction(async (tx) => {
    if (input.action === "client.create") {
      if (
        input.data.role === "ADMIN" &&
        (actor.role !== "SUPER_ADMIN" || !input.data.password)
      )
        throw new HttpError(
          403,
          "Somente SUPER_ADMIN cria administradores com senha.",
        );
      const user = await tx.user.create({
        data: {
          name: input.data.name,
          email: input.data.email,
          role: input.data.role,
          managerId: actor.id,
          monthlyTokenLimit: input.data.monthlyTokenLimit,
          passwordHash: await passwordHash(input.data.password),
          ...(input.data.role === "EMPLOYEE" ? { client: { create: {} } } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: input.action,
          targetType: "User",
          targetId: user.id,
        },
      });
      return;
    }
    if (input.action === "client.update") {
      const user = await tx.user.findUnique({ where: { id: input.id } });
      if (
        !user ||
        !canManage(actor, user) ||
        user.id === actor.id ||
        user.role === "SUPER_ADMIN"
      )
        throw new HttpError(403, "Usuário fora do escopo.");
      await tx.user.update({
        where: { id: input.id },
        data: {
          name: input.name,
          status: input.status,
          monthlyTokenLimit: input.monthlyTokenLimit,
          ...(input.password
            ? { passwordHash: await passwordHash(input.password) }
            : {}),
        },
      });
      if (input.status === "DISABLED" || input.password)
        await tx.session.deleteMany({ where: { userId: user.id } });
    } else {
      const device = await tx.device.findUnique({
        where: { id: input.id },
        include: { user: true },
      });
      if (!device || !canManage(actor, device.user))
        throw new HttpError(403, "Dispositivo fora do escopo.");
      await tx.device.update({
        where: { id: input.id },
        data: { revokedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { deviceId: input.id } });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: input.action,
        targetType: input.action.split(".")[0],
        targetId: input.id,
      },
    });
  });
  return Response.json({ ok: true });
});

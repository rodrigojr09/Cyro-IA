import { z } from "zod";
import { admin } from "@/lib/auth";
import { db } from "@/lib/db";
import { body, endpoint, HttpError, requireOrigin } from "@/lib/http";
const schema = z
  .object({
    action: z.literal("settings.update"),
    intelligenceEnabled: z.boolean(),
    maxOutputTokens: z.number().int().min(100).max(3500),
  })
  .strict();
export const GET = endpoint(async () => {
  const actor = await admin();
  const settings = await db.systemSettings.findUnique({
    where: { id: "global" },
  });
  return Response.json({
    settings: settings ?? { intelligenceEnabled: true, maxOutputTokens: 3500 },
    canConfigure: actor.role === "SUPER_ADMIN",
  });
});
export const POST = endpoint(async (request) => {
  requireOrigin(request);
  const actor = await admin();
  if (actor.role !== "SUPER_ADMIN")
    throw new HttpError(
      403,
      "Somente SUPER_ADMIN altera configurações globais.",
    );
  const { action, ...data } = await body(request, schema);
  await db.$transaction(async (tx) => {
    await tx.systemSettings.upsert({
      where: { id: "global" },
      create: { id: "global", ...data },
      update: data,
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        targetType: "SystemSettings",
        targetId: "global",
      },
    });
  });
  return Response.json({ ok: true });
});

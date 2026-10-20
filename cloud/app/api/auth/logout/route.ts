import { cookies } from "next/headers";
import { admin, COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { hash } from "@/lib/crypto";
import { endpoint, requireOrigin } from "@/lib/http";
export const POST = endpoint(async (request) => {
  requireOrigin(request);
  const actor = await admin();
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (value)
    await db.$transaction([
      db.session.deleteMany({ where: { tokenHash: hash(value) } }),
      db.auditLog.create({
        data: {
          actorId: actor.id,
          action: "auth.logout",
          targetType: "Session",
        },
      }),
    ]);
  jar.delete(COOKIE);
  return Response.json({ ok: true });
});

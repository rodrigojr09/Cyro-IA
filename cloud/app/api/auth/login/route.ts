import { cookies } from "next/headers";
import { loginSchema } from "@jarvis/shared/schemas";
import { db } from "@/lib/db";
import { COOKIE } from "@/lib/auth";
import { body, endpoint, requireOrigin, HttpError } from "@/lib/http";
import { hash, token, passwordMatches, passwordHash } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
let dummy: Promise<string> | undefined;
export const POST = endpoint(async (request) => {
  requireOrigin(request);
  await rateLimit("login:global", 100, 60);
  const input = await body(request, loginSchema);
  await rateLimit(`login:${input.email}`, 5, 300);
  const user = await db.user.findUnique({ where: { email: input.email } });
  dummy ??= passwordHash(token());
  const matches = await passwordMatches(
    input.password,
    user?.passwordHash ?? (await dummy),
  );
  if (
    !matches ||
    !user ||
    user.role === "EMPLOYEE" ||
    user.status !== "ACTIVE"
  ) {
    await db.auditLog.create({
      data: { action: "auth.failed", targetType: "Authentication" },
    });
    throw new HttpError(401, "Credenciais inválidas.");
  }
  const value = token();
  const expires = new Date(Date.now() + 8 * 3600000);
  await db.$transaction([
    db.session.create({
      data: { userId: user.id, tokenHash: hash(value), expiresAt: expires },
    }),
    db.auditLog.create({
      data: { actorId: user.id, action: "auth.login", targetType: "Session" },
    }),
  ]);
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires,
  });
  return Response.json({ ok: true });
});

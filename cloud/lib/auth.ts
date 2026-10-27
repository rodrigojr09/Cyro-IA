import { metricIdentity } from "./metrics";
import { cookies } from "next/headers";
import { db } from "./db";
import { hash } from "./crypto";
import { HttpError } from "./http";
import { canUseSession } from "./policy";

export const COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-jarvis-session"
    : "jarvis-session";
export async function admin() {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value || !/^[\w-]{43}$/.test(value))
    throw new HttpError(401, "Entre para continuar.");
  const session = await db.session.findUnique({
    where: { tokenHash: hash(value) },
    include: { user: true },
  });
  if (
    !session ||
    session.deviceId !== null ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE" ||
    session.user.role === "EMPLOYEE"
  )
    throw new HttpError(401, "Sessão inválida.");
  metricIdentity(session.user.id, session.id);
  return session.user;
}
export async function deviceAuth(request: Request) {
  const value = request.headers
    .get("authorization")
    ?.match(/^Bearer ([\w-]{43})$/)?.[1];
  if (!value) throw new HttpError(401, "Entre para continuar.");
  const session = await db.session.findUnique({
    where: { tokenHash: hash(value) },
    include: { device: true, user: { include: { client: true } } },
  });
  const now = new Date();
  if (!session || !session.device || !canUseSession(session, now))
    throw new HttpError(
      401,
      "Sessão inválida ou acesso bloqueado. Entre novamente.",
    );
  metricIdentity(session.user.id, session.id);
  // Presence is informational, never an authorization decision. The session above
  // is still revalidated on every request; only redundant timestamp writes stop.
  if (
    !session.device.lastSeenAt ||
    now.getTime() - session.device.lastSeenAt.getTime() >= 300_000
  ) {
    await db.device.update({
      where: { id: session.device.id },
      data: { lastSeenAt: now },
    });
  }
  return {
    ...session.device,
    user: session.user,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    tokenHash: session.tokenHash,
  };
}

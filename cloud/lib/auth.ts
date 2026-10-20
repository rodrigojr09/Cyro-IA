import { cookies } from "next/headers";
import { db } from "./db";
import { hash } from "./crypto";
import { HttpError } from "./http";
import { canUseDevice } from "./policy";
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
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE" ||
    session.user.role === "EMPLOYEE"
  )
    throw new HttpError(401, "Sessão inválida.");
  return session.user;
}
export async function deviceAuth(request: Request) {
  const value = request.headers
    .get("authorization")
    ?.match(/^Bearer ([\w-]{43})$/)?.[1];
  if (!value) throw new HttpError(401, "Ativação necessária.");
  const device = await db.device.findUnique({
    where: { credentialHash: hash(value) },
    include: { user: { include: { client: true } }, licenses: true },
  });
  const now = new Date();
  if (!device || !canUseDevice(device, now))
    throw new HttpError(403, "Instalação sem licença ativa.");
  await db.device.update({
    where: { id: device.id },
    data: { lastSeenAt: now },
  });
  return device;
}

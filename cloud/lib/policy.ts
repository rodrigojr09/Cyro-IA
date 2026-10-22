import type { Role } from "@jarvis/shared/types";
export type Actor = { id: string; role: Role };
export function canLoginDesktop(user: { status: string; role: string } | null) {
  return (
    !!user &&
    user.status === "ACTIVE" &&
    ["EMPLOYEE", "ADMIN", "SUPER_ADMIN"].includes(user.role)
  );
}
export type DesktopSession = {
  userId: string;
  expiresAt: Date;
  user: { role: string; status: string; client: unknown };
  device: { userId: string; revokedAt: Date | null } | null;
};
export function canUseSession(
  session: DesktopSession | null,
  now = new Date(),
) {
  return (
    !!session &&
    session.expiresAt > now &&
    canLoginDesktop(session.user) &&
    !!session.user.client &&
    !!session.device &&
    session.device.userId === session.userId &&
    !session.device.revokedAt
  );
}
export function canManage(
  actor: Actor,
  target: { id: string; role: Role; managerId: string | null },
) {
  return (
    actor.role === "SUPER_ADMIN" ||
    (actor.role === "ADMIN" &&
      target.role === "EMPLOYEE" &&
      target.managerId === actor.id)
  );
}
export function scope(actor: Actor) {
  return actor.role === "SUPER_ADMIN"
    ? {}
    : { managerId: actor.id, role: "EMPLOYEE" as const };
}

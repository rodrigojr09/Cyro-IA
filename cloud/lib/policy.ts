import type { Role } from "@jarvis/shared/types";
export type Actor = { id: string; role: Role };
export type DeviceAccess = {
  userId: string;
  revokedAt: Date | null;
  credentialExpiresAt: Date;
  user: { status: string; role: string; client: unknown };
  licenses: {
    userId: string;
    status: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  }[];
};
export function canUseDevice(device: DeviceAccess | null, now = new Date()) {
  return (
    !!device &&
    !!device.user.client &&
    device.user.role === "EMPLOYEE" &&
    !device.revokedAt &&
    device.credentialExpiresAt > now &&
    device.user.status === "ACTIVE" &&
    device.licenses.some(
      (license) =>
        license.userId === device.userId &&
        license.status === "ACTIVE" &&
        !license.revokedAt &&
        (!license.expiresAt || license.expiresAt > now),
    )
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
export function canActivate(
  code: {
    revokedAt: Date | null;
    consumedAt: Date | null;
    expiresAt: Date;
    uses: number;
    maxUses: number;
  },
  now = new Date(),
) {
  return (
    !code.revokedAt &&
    !code.consumedAt &&
    code.expiresAt > now &&
    code.uses < code.maxUses
  );
}

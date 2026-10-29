import { HttpError } from "../http";
export function releaseAdmin(user: { role: string }) {
  if (user.role !== "SUPER_ADMIN")
    throw new HttpError(403, "Somente o SUPER_ADMIN publica versões.");
}

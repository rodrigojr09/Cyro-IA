import { deviceAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hash, token } from "@/lib/crypto";
import { endpoint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
export const GET = endpoint(async (request) => {
  const device = await deviceAuth(request);
  return Response.json({
    active: true,
    user: { id: device.userId, name: device.user.name },
    expiresAt: device.credentialExpiresAt,
  });
});
export const POST = endpoint(async (request) => {
  const device = await deviceAuth(request);
  await rateLimit(`renew:${device.id}`, 5, 3600);
  const value = token(),
    expiresAt = new Date(Date.now() + 90 * 86400000);
  // Compare old hash to prevent parallel renewals both returning valid credentials.
  const result = await db.device.updateMany({
    where: {
      id: device.id,
      credentialHash: device.credentialHash,
      revokedAt: null,
    },
    data: { credentialHash: hash(value), credentialExpiresAt: expiresAt },
  });
  if (result.count !== 1)
    return Response.json(
      { error: "Sessão já renovada. Tente novamente." },
      { status: 409 },
    );
  return Response.json({ credential: value, expiresAt });
});

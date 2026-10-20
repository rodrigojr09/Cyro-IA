import { db } from "./db";
import { hash } from "./crypto";
import { HttpError } from "./http";
export async function rateLimit(key: string, limit: number, seconds: number) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const row = await db.rateLimit.upsert({
    where: { key: hash(`${key}:${bucket}`) },
    create: {
      key: hash(`${key}:${bucket}`),
      count: 1,
      expiresAt: new Date((bucket + 2) * seconds * 1000),
    },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit)
    throw new HttpError(429, "Muitas tentativas. Aguarde.");
}

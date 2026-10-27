import { db } from "./db";
import { HttpError } from "./http";
import type { Prisma } from "../generated/prisma/client";

export const STORAGE_MESSAGE =
  "Limite de memória na nuvem atingido. Apague alguns chats para liberar memória e continuar usando o Cyro.";
// Logical UTF-8 payload, including summaries and metadata; not Postgres disk size.
export const STORAGE_HEADROOM = 65536;
export async function storageStatus(
  userId: string,
  client: Pick<Prisma.TransactionClient, "$queryRaw"> = db,
) {
  const rows = await client.$queryRaw<
    { usedBytes: bigint | number; limitBytes: number }[]
  >`
    SELECT u."cloudStorageLimitBytes" AS "limitBytes",
      COALESCE((SELECT SUM(octet_length(c.title) + octet_length(c.summary) + octet_length(c.instructions) + 128)
        FROM "Conversation" c WHERE c."userId"=u.id),0) +
      COALESCE((SELECT SUM(octet_length(m.content) + octet_length(m.scope) + 64)
        FROM "ChatMessage" m JOIN "Conversation" c ON c.id=m."conversationId" WHERE c."userId"=u.id),0) AS "usedBytes"
    FROM "User" u WHERE u.id=${userId}::uuid`;
  if (!rows.length) throw new HttpError(404, "Conta inexistente.");
  const usedBytes = Number(rows[0].usedBytes),
    limitBytes = Number(rows[0].limitBytes);
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    blocked: usedBytes + STORAGE_HEADROOM >= limitBytes,
    message: STORAGE_MESSAGE,
  };
}
export async function requireStorage(userId: string) {
  const status = await storageStatus(userId);
  if (status.blocked) throw new HttpError(507, STORAGE_MESSAGE);
  return status;
}
export async function storageMutation<T>(
  userId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      // One owner lock serializes inserts/edits/deletion across all devices.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const before = await storageStatus(userId, tx);
      const result = await mutation(tx);
      const after = await storageStatus(userId, tx);
      if (
        after.usedBytes > before.usedBytes &&
        (before.blocked || after.usedBytes > after.limitBytes)
      )
        throw new HttpError(507, STORAGE_MESSAGE);
      return result;
    },
    { maxWait: 10000, timeout: 20000 },
  );
}

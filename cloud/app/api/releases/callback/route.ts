import { z } from "zod";
import { db } from "@/lib/db";
import { body, endpoint, HttpError } from "@/lib/http";
import { verifyTicket } from "@/lib/releases/tickets";
import { invalidateReleases } from "@/lib/releases/catalog";
import { officialSetup } from "../../../../../desktop/scripts/updates/protocol.js";
const payload = z
  .object({
    purpose: z.literal("publisher-callback"),
    id: z.string().uuid(),
    attempt: z.string().uuid(),
    event: z.enum(["start", "complete", "fail"]),
    exp: z.number().int(),
    releaseId: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
    assetId: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
    url: z.string().max(1024).optional(),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    size: z.number().int().optional(),
    private: z.boolean().optional(),
  })
  .strict();
export const POST = endpoint(async (request) => {
  const input = await body(
    request,
    z.object({ ticket: z.string().max(8192) }).strict(),
    10000,
  );
  let value;
  try {
    value = payload.parse(verifyTicket(input.ticket));
  } catch {
    throw new HttpError(401, "Callback inválido.");
  }
  const current = await db.cyroRelease.findUnique({ where: { id: value.id } });
  if (!current || current.attempt !== value.attempt)
    throw new HttpError(409, "Tentativa obsoleta.");
  if (
    value.event === "complete" &&
    current.status === "PUBLISHED" &&
    current.checksum === value.checksum &&
    current.githubAssetId === value.assetId
  )
    return Response.json({ ok: true });
  const expected = value.event === "start" ? "UPLOADING" : "PROCESSING";
  if (current.status !== expected)
    throw new HttpError(409, "Estado de publicação inválido.");
  if (
    value.event === "complete" &&
    (!value.releaseId ||
      !value.assetId ||
      !value.url ||
      !officialSetup(value.url, current.githubTag) ||
      !value.checksum ||
      value.size !== current.fileSize ||
      value.private === undefined)
  )
    throw new HttpError(400, "Asset não confirmado.");
  await db.$transaction(async (tx) => {
    const changed = await tx.cyroRelease.updateMany({
      where: { id: current.id, attempt: value.attempt, status: expected },
      data:
        value.event === "start"
          ? { status: "PROCESSING" }
          : value.event === "fail"
            ? {
                status: "FAILED",
                error:
                  "Publicação interrompida. Revise o serviço e use Recuperar.",
                leaseUntil: null,
              }
            : {
                status: "PUBLISHED",
                githubReleaseId: value.releaseId,
                githubAssetId: value.assetId,
                setupUrl: value.url,
                checksum: value.checksum,
                repositoryPrivate: value.private,
                publishedAt: new Date(),
                error: null,
                leaseUntil: null,
              },
    });
    if (changed.count !== 1)
      throw new HttpError(409, "Tentativa já atualizada.");
    await tx.auditLog.create({
      data: {
        action: "release." + value.event,
        targetType: "CyroRelease",
        targetId: current.id,
      },
    });
  });
  if (value.event === "complete") invalidateReleases();
  return Response.json({ ok: true });
});

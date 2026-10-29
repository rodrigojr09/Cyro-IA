import { z } from "zod";
import { deviceAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { body, endpoint, HttpError } from "@/lib/http";
import { publisherOrigin, signTicket } from "@/lib/releases/tickets";
import { releaseMetadata } from "@/lib/releases/catalog";
export const POST = endpoint(async (request) => {
  await deviceAuth(request);
  const { id } = await body(
    request,
    z.object({ id: z.string().uuid() }).strict(),
  );
  const row = await db.cyroRelease.findUnique({ where: { id } });
  if (!row || row.status !== "PUBLISHED")
    throw new HttpError(404, "Versão indisponível.");
  const metadata = releaseMetadata(row);
  if (!row.repositoryPrivate)
    return Response.json(
      { url: row.setupUrl, origin: "https://github.com", metadata },
      { headers: { "Cache-Control": "no-store" } },
    );
  const origin = publisherOrigin();
  const ticket = signTicket({
    purpose: "download",
    id: row.id,
    asset: row.githubAssetId,
    checksum: row.checksum,
    size: row.fileSize,
    exp: Date.now() + 120_000,
  });
  return Response.json(
    {
      url: origin + "/download?ticket=" + encodeURIComponent(ticket),
      origin,
      metadata,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});

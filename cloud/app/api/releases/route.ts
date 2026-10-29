import { randomUUID } from "node:crypto";
import { z } from "zod";
import { admin } from "@/lib/auth";
import { db } from "@/lib/db";
import { body, endpoint, HttpError, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { releaseAdmin } from "@/lib/releases/policy";
import { cachedTags, refreshTags } from "@/lib/releases/tag-cache";
import { githubClient } from "@/lib/releases/github";
import {
  publisherOrigin,
  signingKey,
  signTicket,
} from "@/lib/releases/tickets";
import {
  tagVersion,
  semver,
  validSize,
} from "../../../../desktop/scripts/updates/protocol.js";
async function actor() {
  const user = await admin();
  releaseAdmin(user);
  return user;
}
export const GET = endpoint(async (request) => {
  const user = await actor();
  if (new URL(request.url).searchParams.get("fresh") === "1") {
    await rateLimit("release-tags:" + user.id, 10, 3600);
    refreshTags();
  }
  const history = await db.cyroRelease.findMany({
    orderBy: { createdAt: "desc" },
  });
  let tags: Awaited<ReturnType<ReturnType<typeof githubClient>["tags"]>> = [],
    warning = "";
  try {
    tags = await cachedTags();
  } catch {
    warning =
      "Não foi possível consultar as tags. Configure a integração GitHub no servidor.";
  }
  let configured = true;
  try {
    publisherOrigin();
    signingKey();
  } catch {
    configured = false;
  }
  return Response.json(
    {
      history,
      tags: tags.map((t) => ({
        ...t,
        used: history.some((r) => r.githubTag === t.name),
      })),
      configured,
      warning,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      tag: z.string().min(1).max(101),
      name: z.string().min(1).max(255),
      size: z.number().int(),
      changelog: z
        .string()
        .max(4000)
        .refine((value) => Buffer.byteLength(value, "utf8") <= 4000),
    })
    .strict(),
  z
    .object({
      action: z.literal("recover"),
      id: z.string().uuid(),
      size: z.number().int(),
    })
    .strict(),
]);
export const POST = endpoint(async (request) => {
  requireOrigin(request);
  const user = await actor();
  await rateLimit("release:" + user.id, 10, 3600);
  const input = await body(request, command, 16384);
  if (
    !validSize(input.size) ||
    (input.action === "create" &&
      (!/\.exe$/i.test(input.name) || /[\x00-\x1f/\\]/.test(input.name)))
  )
    throw new HttpError(
      400,
      "Selecione um instalador .exe válido de até 1 GB.",
    );
  const origin = publisherOrigin();
  signingKey();
  const github = githubClient(),
    attempt = randomUUID();
  const before =
    input.action === "recover"
      ? await db.cyroRelease.findUnique({ where: { id: input.id } })
      : null;
  if (input.action === "recover" && !before)
    throw new HttpError(404, "Versão não encontrada.");
  const tag = input.action === "create" ? input.tag : before!.githubTag;
  let version: string, sha: string;
  try {
    version = tagVersion(tag);
    sha = await github.tag(tag);
  } catch {
    throw new HttpError(
      400,
      "Tag inexistente, inválida ou GitHub indisponível.",
    );
  }
  const row = await db.$transaction(async (tx) => {
    let data;
    if (input.action === "create") {
      if (await tx.cyroRelease.findUnique({ where: { githubTag: input.tag } }))
        throw new HttpError(
          409,
          "Tag já cadastrada. Use a recuperação explícita no histórico.",
        );
      data = await tx.cyroRelease.create({
        data: {
          version,
          githubTag: input.tag,
          tagSha: sha,
          fileSize: input.size,
          changelog: input.changelog,
          stable: semver(version)!.pre.length === 0,
          attempt,
          leaseUntil: new Date(Date.now() + 2 * 3600_000),
        },
      });
    } else {
      const old = await tx.cyroRelease.findUnique({ where: { id: input.id } });
      if (
        !old ||
        old.status === "PUBLISHED" ||
        (old.leaseUntil &&
          old.leaseUntil > new Date() &&
          !["FAILED", "UPLOADING"].includes(old.status))
      )
        throw new HttpError(409, "Publicação concluída ou ainda em andamento.");
      if (sha !== old.tagSha)
        throw new HttpError(409, "A tag mudou. Recuperação bloqueada.");
      const updated = await tx.cyroRelease.updateMany({
        where: { id: old.id, attempt: old.attempt, status: old.status },
        data: {
          attempt,
          status: "UPLOADING",
          fileSize: input.size,
          recovery: true,
          error: null,
          leaseUntil: new Date(Date.now() + 2 * 3600_000),
        },
      });
      if (updated.count !== 1)
        throw new HttpError(409, "Tentativa já atualizada.");
      data = (await tx.cyroRelease.findUnique({ where: { id: old.id } }))!;
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "release." + input.action,
        targetType: "CyroRelease",
        targetId: data.id,
      },
    });
    return data;
  });
  const ticket = signTicket({
    purpose: "upload",
    id: row.id,
    attempt,
    tag: row.githubTag,
    sha: row.tagSha,
    version: row.version,
    size: row.fileSize,
    changelog: row.changelog,
    recover: row.recovery,
    exp: Date.now() + 2 * 3600_000,
  });
  return Response.json(
    { id: row.id, url: origin + "/upload", ticket },
    { headers: { "Cache-Control": "no-store" } },
  );
});

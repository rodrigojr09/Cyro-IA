import { unstable_cache, revalidateTag } from "next/cache";
import { db } from "../db";
import { officialSetup } from "../../../desktop/scripts/updates/protocol.js";
import { latestStable } from "./selection";
export const CACHE_TAG = "cyro-releases";
export const latestRelease = unstable_cache(
  async () =>
    latestStable(
      await db.cyroRelease.findMany({
        where: { status: "PUBLISHED", stable: true },
      }),
    ),
  ["cyro-latest-v1"],
  { revalidate: 300, tags: [CACHE_TAG] },
);
export function invalidateReleases() {
  revalidateTag(CACHE_TAG, { expire: 0 });
}
export function releaseMetadata(
  row: NonNullable<Awaited<ReturnType<typeof latestRelease>>>,
) {
  if (
    !row.setupUrl ||
    !officialSetup(row.setupUrl, row.githubTag) ||
    !row.checksum
  )
    throw Error("Metadados de publicação inválidos.");
  return {
    id: row.id,
    version: row.version,
    tag: row.githubTag,
    setupUrl: row.setupUrl,
    checksum: row.checksum,
    fileSize: row.fileSize,
    changelog: row.changelog,
    publishedAt: row.publishedAt,
    private: row.repositoryPrivate,
  };
}

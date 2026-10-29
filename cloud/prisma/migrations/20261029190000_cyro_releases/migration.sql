CREATE TABLE "CyroRelease" (
  "id" UUID NOT NULL,
  "version" VARCHAR(100) NOT NULL,
  "githubTag" VARCHAR(101) NOT NULL,
  "tagSha" VARCHAR(64) NOT NULL,
  "githubReleaseId" VARCHAR(32),
  "githubAssetId" VARCHAR(32),
  "setupUrl" TEXT,
  "checksum" VARCHAR(64),
  "fileSize" INTEGER NOT NULL,
  "changelog" TEXT NOT NULL DEFAULT '',
  "status" VARCHAR(20) NOT NULL DEFAULT 'UPLOADING',
  "stable" BOOLEAN NOT NULL DEFAULT true,
  "repositoryPrivate" BOOLEAN NOT NULL DEFAULT true,
  "attempt" UUID NOT NULL,
  "recovery" BOOLEAN NOT NULL DEFAULT false,
  "leaseUntil" TIMESTAMP(3),
  "error" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CyroRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CyroRelease_size" CHECK ("fileSize" BETWEEN 65536 AND 1073741824),
  CONSTRAINT "CyroRelease_status" CHECK ("status" IN ('UPLOADING','PROCESSING','FAILED','PUBLISHED')),
  CONSTRAINT "CyroRelease_publication" CHECK ("status" <> 'PUBLISHED' OR ("setupUrl" IS NOT NULL AND "checksum" IS NOT NULL AND "githubReleaseId" IS NOT NULL AND "githubAssetId" IS NOT NULL AND "publishedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "CyroRelease_version_key" ON "CyroRelease"("version");
CREATE UNIQUE INDEX "CyroRelease_githubTag_key" ON "CyroRelease"("githubTag");
CREATE UNIQUE INDEX "CyroRelease_githubReleaseId_key" ON "CyroRelease"("githubReleaseId");
CREATE UNIQUE INDEX "CyroRelease_githubAssetId_key" ON "CyroRelease"("githubAssetId");
CREATE INDEX "CyroRelease_status_stable_idx" ON "CyroRelease"("status", "stable");

CREATE TABLE "ProviderConfiguration" (
 "id" VARCHAR(16) NOT NULL, "ciphertext" TEXT, "revision" INTEGER NOT NULL DEFAULT 0,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ProviderConfiguration_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProviderConfiguration_id_check" CHECK ("id" IN ('openai','spotify')),
 CONSTRAINT "ProviderConfiguration_revision_check" CHECK ("revision" >= 0)
);
INSERT INTO "ProviderConfiguration" ("id") VALUES ('openai'),('spotify');

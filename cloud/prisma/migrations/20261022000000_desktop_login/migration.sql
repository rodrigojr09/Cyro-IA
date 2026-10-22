ALTER TABLE "Session" ADD COLUMN "deviceId" UUID;
ALTER TABLE "Session" ADD CONSTRAINT "Session_deviceId_userId_fkey" FOREIGN KEY ("deviceId", "userId") REFERENCES "Device"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");
-- Invalidate legacy activation credentials; preserve historical usage and audit records.
ALTER TABLE "Device" DROP COLUMN "credentialHash", DROP COLUMN "credentialExpiresAt";
UPDATE "ActivationCode" SET "revokedAt" = NOW() WHERE "revokedAt" IS NULL;

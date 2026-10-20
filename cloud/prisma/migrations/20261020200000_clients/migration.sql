CREATE TABLE "Client" (
 "id" UUID NOT NULL,
 "maxDevices" INTEGER NOT NULL DEFAULT 2,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Client_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Client_maxDevices_check" CHECK ("maxDevices" BETWEEN 1 AND 100),
 CONSTRAINT "Client_id_fkey" FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "Client" ("id","updatedAt") SELECT "id",CURRENT_TIMESTAMP FROM "User" WHERE role='EMPLOYEE';
ALTER TABLE "Device" ADD CONSTRAINT "Device_client_fkey" FOREIGN KEY ("userId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_client_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SystemSettings" (
 "id" TEXT NOT NULL DEFAULT 'global',
 "intelligenceEnabled" BOOLEAN NOT NULL DEFAULT true,
 "maxOutputTokens" INTEGER NOT NULL DEFAULT 3500,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SystemSettings_global_check" CHECK (id='global' AND "maxOutputTokens" BETWEEN 100 AND 3500)
);

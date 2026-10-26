CREATE TABLE "SpotifyConnection" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "provider" TEXT NOT NULL DEFAULT 'spotify',
 "spotifyUserId" VARCHAR(128) NOT NULL, "displayName" VARCHAR(200) NOT NULL, "scopes" TEXT[] NOT NULL,
 "accessToken" TEXT NOT NULL, "refreshToken" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'connected', "refreshLeaseUntil" TIMESTAMP(3), "retryAt" TIMESTAMP(3),
 "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SpotifyConnection_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SpotifyConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "SpotifyConnection_status_check" CHECK ("status" IN ('connected','error'))
);
CREATE UNIQUE INDEX "SpotifyConnection_userId_key" ON "SpotifyConnection"("userId");
CREATE UNIQUE INDEX "SpotifyConnection_spotifyUserId_key" ON "SpotifyConnection"("spotifyUserId");
CREATE TABLE "SpotifyOAuthTransaction" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "sessionId" UUID NOT NULL, "ticketHash" TEXT NOT NULL,
 "stateHash" TEXT, "browserHash" TEXT, "status" TEXT NOT NULL DEFAULT 'pending',
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SpotifyOAuthTransaction_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SpotifyOAuthTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "SpotifyOAuthTransaction_status_check" CHECK ("status" IN ('pending','authorizing','processing','completed','denied','cancelled','failed'))
);
CREATE UNIQUE INDEX "SpotifyOAuthTransaction_ticketHash_key" ON "SpotifyOAuthTransaction"("ticketHash");
CREATE UNIQUE INDEX "SpotifyOAuthTransaction_stateHash_key" ON "SpotifyOAuthTransaction"("stateHash");
CREATE INDEX "SpotifyOAuthTransaction_userId_expiresAt_idx" ON "SpotifyOAuthTransaction"("userId","expiresAt");

CREATE TABLE "Conversation" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "slot" VARCHAR(16), "title" VARCHAR(120) NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "summary" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3),
  CONSTRAINT "Conversation_slot_check" CHECK ("slot" IS NULL OR "slot" IN ('general','quick'))
);
CREATE UNIQUE INDEX "Conversation_userId_slot_key" ON "Conversation"("userId","slot");
CREATE INDEX "Conversation_userId_lastMessageAt_idx" ON "Conversation"("userId","lastMessageAt");
CREATE TABLE "ChatMessage" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "conversationId" UUID NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "requestId" UUID NOT NULL,
  "role" VARCHAR(16) NOT NULL CHECK ("role" IN ('user','assistant')),
  "content" TEXT NOT NULL,
  "scope" VARCHAR(32) NOT NULL DEFAULT '' CHECK ("scope" IN ('','quick:general')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChatMessage_conversationId_requestId_key" ON "ChatMessage"("conversationId","requestId");
CREATE INDEX "ChatMessage_conversationId_id_idx" ON "ChatMessage"("conversationId","id");

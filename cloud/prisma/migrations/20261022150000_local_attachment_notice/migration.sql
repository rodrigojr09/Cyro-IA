ALTER TABLE "ChatMessage" ADD COLUMN "localAttachmentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_localAttachmentCount_check"
CHECK ("localAttachmentCount" BETWEEN 0 AND 5 AND ("localAttachmentCount" = 0 OR role = 'user'));

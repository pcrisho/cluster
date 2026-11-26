-- Documents are deleted for good; the trash (soft delete) is gone.
DELETE FROM "documents" WHERE "removedAt" IS NOT NULL;
DROP INDEX "documents_pageId_removedAt_idx";
ALTER TABLE "documents" DROP COLUMN "removedAt";
CREATE INDEX "documents_pageId_idx" ON "documents"("pageId");

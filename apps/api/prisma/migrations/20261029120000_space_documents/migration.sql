-- A document belongs to a page or to a space (never both, never neither).

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "spaceId" TEXT,
ALTER COLUMN "pageId" DROP NOT NULL;

-- Prisma cannot model a CHECK constraint: written by hand.
ALTER TABLE "documents" ADD CONSTRAINT "documents_one_owner_check" CHECK (("pageId" IS NULL) <> ("spaceId" IS NULL));

-- CreateIndex
CREATE INDEX "documents_spaceId_updatedAt_idx" ON "documents"("spaceId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

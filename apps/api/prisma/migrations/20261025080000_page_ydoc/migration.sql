-- Yjs state of a page (source of truth for real-time editing).
ALTER TABLE "pages" ADD COLUMN "ydoc" BYTEA,
ADD COLUMN "ydocRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastEditedById" TEXT;

ALTER TABLE "pages" ADD CONSTRAINT "pages_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

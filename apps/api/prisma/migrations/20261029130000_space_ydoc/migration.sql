-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "ydoc" BYTEA,
ADD COLUMN     "ydocRevision" INTEGER NOT NULL DEFAULT 0;

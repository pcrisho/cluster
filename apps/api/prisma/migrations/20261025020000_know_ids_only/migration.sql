-- Spaces and pages are addressed by id only; the legacy plain-text description is gone.
DROP INDEX "spaces_slug_organizationId_key";
DROP INDEX "pages_slug_spaceId_key";
ALTER TABLE "spaces" DROP COLUMN "slug", DROP COLUMN "description";
ALTER TABLE "pages" DROP COLUMN "slug";

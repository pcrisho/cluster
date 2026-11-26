-- Space backgrounds and page covers are gone: the pages read better without them.
DROP INDEX "spaces_organizationId_heroBackgroundType_idx";
CREATE INDEX "spaces_organizationId_idx" ON "spaces"("organizationId");

ALTER TABLE "spaces" DROP COLUMN "heroBackgroundType",
DROP COLUMN "heroBackgroundPreset";
ALTER TABLE "pages" DROP COLUMN "coverType",
DROP COLUMN "coverPreset";

DROP TYPE "HeroBackgroundType";
DROP TYPE "PageCoverType";

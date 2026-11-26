-- Space backgrounds and page covers are presets only; uploaded images are gone.
UPDATE "spaces" SET "heroBackgroundType" = 'NONE', "heroBackgroundPreset" = NULL WHERE "heroBackgroundType" = 'UPLOAD';
UPDATE "pages" SET "coverType" = 'NONE', "coverPreset" = NULL WHERE "coverType" = 'UPLOAD';

ALTER TABLE "spaces" DROP COLUMN "heroBackgroundKey";
ALTER TABLE "pages" DROP COLUMN "coverKey";

ALTER TYPE "HeroBackgroundType" RENAME TO "HeroBackgroundType_old";
CREATE TYPE "HeroBackgroundType" AS ENUM ('NONE', 'PRESET');
ALTER TABLE "spaces" ALTER COLUMN "heroBackgroundType" DROP DEFAULT;
ALTER TABLE "spaces" ALTER COLUMN "heroBackgroundType" TYPE "HeroBackgroundType" USING "heroBackgroundType"::text::"HeroBackgroundType";
ALTER TABLE "spaces" ALTER COLUMN "heroBackgroundType" SET DEFAULT 'NONE';
DROP TYPE "HeroBackgroundType_old";

ALTER TYPE "PageCoverType" RENAME TO "PageCoverType_old";
CREATE TYPE "PageCoverType" AS ENUM ('NONE', 'PRESET');
ALTER TABLE "pages" ALTER COLUMN "coverType" DROP DEFAULT;
ALTER TABLE "pages" ALTER COLUMN "coverType" TYPE "PageCoverType" USING "coverType"::text::"PageCoverType";
ALTER TABLE "pages" ALTER COLUMN "coverType" SET DEFAULT 'NONE';
DROP TYPE "PageCoverType_old";

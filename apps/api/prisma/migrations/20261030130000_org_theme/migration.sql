-- AlterTable
ALTER TABLE "instance_settings" ADD COLUMN     "orgThemingAllowed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "brandPrimary" TEXT,
ADD COLUMN     "brandSecondary" TEXT,
ADD COLUMN     "fontKey" TEXT,
ADD COLUMN     "radiusKey" TEXT,
ADD COLUMN     "themingEnabled" BOOLEAN NOT NULL DEFAULT true;

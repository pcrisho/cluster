-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "isolateRootNodes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "instance_settings" ADD COLUMN     "nodeIsolationAllowed" BOOLEAN NOT NULL DEFAULT false;

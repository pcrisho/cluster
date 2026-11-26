-- AlterTable
ALTER TABLE "org_nodes" ADD COLUMN     "code" TEXT,
ADD COLUMN     "external" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "org_nodes_organizationId_code_key" ON "org_nodes"("organizationId", "code");

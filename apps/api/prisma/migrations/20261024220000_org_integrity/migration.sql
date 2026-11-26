-- A person manages at most one area. NULLs stay free, so this is the partial unique index
-- the application already assumed, in a form Prisma knows about (a raw partial index gets dropped
-- by the next `migrate dev`).
DROP INDEX "org_nodes_managerId_idx";
CREATE UNIQUE INDEX "org_nodes_managerId_key" ON "org_nodes"("managerId");

-- NULL parentId / orgNodeId must count as a value, or root areas and global positions could be
-- duplicated. Prisma cannot express NULLS NOT DISTINCT but keeps an index with the same name and
-- columns, so these survive future migrations.
DROP INDEX "org_nodes_name_parentId_organizationId_key";
CREATE UNIQUE INDEX "org_nodes_name_parentId_organizationId_key"
  ON "org_nodes"("name", "parentId", "organizationId") NULLS NOT DISTINCT;

DROP INDEX "positions_name_organizationId_orgNodeId_key";
CREATE UNIQUE INDEX "positions_name_organizationId_orgNodeId_key"
  ON "positions"("name", "organizationId", "orgNodeId") NULLS NOT DISTINCT;

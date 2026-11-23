-- Per-space access list. A space is open to the whole organization unless `restricted`.
ALTER TABLE "spaces" ADD COLUMN "restricted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "space_access" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "role" "AccessRole" NOT NULL,
    "userId" TEXT,
    "orgNodeId" TEXT,
    "positionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_access_pkey" PRIMARY KEY ("id"),
    -- exactly one principal per row
    CONSTRAINT "space_access_one_principal" CHECK (num_nonnulls("userId", "orgNodeId", "positionId") = 1)
);

CREATE UNIQUE INDEX "space_access_spaceId_userId_key" ON "space_access"("spaceId", "userId");
CREATE UNIQUE INDEX "space_access_spaceId_orgNodeId_key" ON "space_access"("spaceId", "orgNodeId");
CREATE UNIQUE INDEX "space_access_spaceId_positionId_key" ON "space_access"("spaceId", "positionId");
CREATE INDEX "space_access_userId_idx" ON "space_access"("userId");
CREATE INDEX "space_access_orgNodeId_idx" ON "space_access"("orgNodeId");
CREATE INDEX "space_access_positionId_idx" ON "space_access"("positionId");

ALTER TABLE "space_access" ADD CONSTRAINT "space_access_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "space_access" ADD CONSTRAINT "space_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "space_access" ADD CONSTRAINT "space_access_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "org_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "space_access" ADD CONSTRAINT "space_access_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Whoever created a space keeps managing it.
INSERT INTO "space_access" ("id", "spaceId", "role", "userId", "createdById")
SELECT gen_random_uuid(), s."id", 'MANAGER', s."createdBy", s."createdBy"
FROM "spaces" s
WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."createdBy");

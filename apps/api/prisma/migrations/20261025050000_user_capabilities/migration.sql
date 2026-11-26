-- Organization-wide permissions granted by an admin to specific people.
CREATE TYPE "Capability" AS ENUM ('KNOW_SPACE_CREATE', 'KNOW_SPACE_DELETE');

CREATE TABLE "user_capabilities" (
    "userId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_capabilities_pkey" PRIMARY KEY ("userId","capability")
);

ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

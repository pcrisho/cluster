-- CreateTable
CREATE TABLE "login_throttle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lockLevel" INTEGER NOT NULL DEFAULT 0,
    "lastLockAt" TIMESTAMP(3),
    "recentWrong" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "login_throttle_pkey" PRIMARY KEY ("key")
);

-- Authentication state, closed to the app role (see 20261102104304_auth_sessions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cluster_app') THEN
    REVOKE ALL ON "login_throttle" FROM cluster_app;
  END IF;
END $$;

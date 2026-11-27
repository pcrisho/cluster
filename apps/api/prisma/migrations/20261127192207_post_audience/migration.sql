-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "restricted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "post_audience" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT app_org_id(),
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "orgNodeId" TEXT,
    "positionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_audience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_audience_userId_idx" ON "post_audience"("userId");

-- CreateIndex
CREATE INDEX "post_audience_orgNodeId_idx" ON "post_audience"("orgNodeId");

-- CreateIndex
CREATE INDEX "post_audience_positionId_idx" ON "post_audience"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "post_audience_postId_userId_key" ON "post_audience"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "post_audience_postId_orgNodeId_key" ON "post_audience"("postId", "orgNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "post_audience_postId_positionId_key" ON "post_audience"("postId", "positionId");

-- AddForeignKey
ALTER TABLE "post_audience" ADD CONSTRAINT "post_audience_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_audience" ADD CONSTRAINT "post_audience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_audience" ADD CONSTRAINT "post_audience_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "org_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_audience" ADD CONSTRAINT "post_audience_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS & org propagation from parent Post
CREATE TRIGGER org_from_parent
  BEFORE INSERT OR UPDATE OF "postId", "organizationId" ON "post_audience"
  FOR EACH ROW EXECUTE FUNCTION org_from_parent('Post', 'postId');

ALTER TABLE "post_audience" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "post_audience"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

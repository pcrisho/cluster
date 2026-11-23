-- Indexes chosen from the plans in docs/specs/org/rls/evidence/indexes (RLS spec, phase 2).

-- Covered by the unique ("postId", "userId") and by ("pageId", "updatedAt" DESC): same plans without them.
DROP INDEX "PostLike_postId_idx";
DROP INDEX "documents_pageId_idx";

-- Activity: newest entries of one organization (was a sequential scan of every organization's log).
CREATE INDEX "audit_log_organizationId_createdAt_id_idx" ON "audit_log"("organizationId", "createdAt" DESC, "id" DESC);

-- GROW reports read the progress of a whole organization.
CREATE INDEX "step_progress_organizationId_idx" ON "step_progress"("organizationId");

-- The wall: row-level security on every tenant table (not FORCE: the owner keeps bypassing it).
-- The policy reads the organization through app_org_id(), evaluated once per query.

ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "Post"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "PostComment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "PostComment"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "PostLike" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "PostLike"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "User"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "audit_log"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "celebration_reactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "celebration_reactions"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "certificates"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "course_assignments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "course_assignments"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "course_sections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "course_sections"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "course_steps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "course_steps"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "courses"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "document_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "document_versions"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "documents"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "enrollments"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "notifications"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "org_nodes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "org_nodes"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "page_tags" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "page_tags"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "page_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "page_versions"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "pages"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "positions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "positions"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "quiz_attempts"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "space_access" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "space_access"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "spaces"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "step_progress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "step_progress"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "tags"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "user_capabilities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "user_capabilities"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "user_profiles"
  USING ("organizationId" = (SELECT app_org_id()))
  WITH CHECK ("organizationId" = (SELECT app_org_id()));

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "Organization"
  USING (id = (SELECT app_org_id()))
  WITH CHECK (id = (SELECT app_org_id()));

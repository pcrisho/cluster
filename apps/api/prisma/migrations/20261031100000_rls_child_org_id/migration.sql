-- Child tables carry their organization so row level security can filter them
-- without a join. The default is the session's organization (app.org_id).
CREATE FUNCTION app_org_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.org_id', true), '') $$;

-- user_profiles
ALTER TABLE "user_profiles" ADD COLUMN "organizationId" TEXT;
UPDATE "user_profiles" c SET "organizationId" = p."organizationId" FROM "User" p WHERE p."id" = c."userId";
ALTER TABLE "user_profiles" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "user_profiles" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- user_capabilities
ALTER TABLE "user_capabilities" ADD COLUMN "organizationId" TEXT;
UPDATE "user_capabilities" c SET "organizationId" = p."organizationId" FROM "User" p WHERE p."id" = c."userId";
ALTER TABLE "user_capabilities" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "user_capabilities" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- notifications
ALTER TABLE "notifications" ADD COLUMN "organizationId" TEXT;
UPDATE "notifications" c SET "organizationId" = p."organizationId" FROM "User" p WHERE p."id" = c."userId";
ALTER TABLE "notifications" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- celebration_reactions
ALTER TABLE "celebration_reactions" ADD COLUMN "organizationId" TEXT;
UPDATE "celebration_reactions" c SET "organizationId" = p."organizationId" FROM "User" p WHERE p."id" = c."targetUserId";
ALTER TABLE "celebration_reactions" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "celebration_reactions" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- "PostLike"
ALTER TABLE "PostLike" ADD COLUMN "organizationId" TEXT;
UPDATE "PostLike" c SET "organizationId" = p."organizationId" FROM "Post" p WHERE p."id" = c."postId";
ALTER TABLE "PostLike" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PostLike" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- "PostComment"
ALTER TABLE "PostComment" ADD COLUMN "organizationId" TEXT;
UPDATE "PostComment" c SET "organizationId" = p."organizationId" FROM "Post" p WHERE p."id" = c."postId";
ALTER TABLE "PostComment" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "PostComment" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- space_access
ALTER TABLE "space_access" ADD COLUMN "organizationId" TEXT;
UPDATE "space_access" c SET "organizationId" = p."organizationId" FROM "spaces" p WHERE p."id" = c."spaceId";
ALTER TABLE "space_access" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "space_access" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- pages
ALTER TABLE "pages" ADD COLUMN "organizationId" TEXT;
UPDATE "pages" c SET "organizationId" = p."organizationId" FROM "spaces" p WHERE p."id" = c."spaceId";
ALTER TABLE "pages" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "pages" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- page_versions
ALTER TABLE "page_versions" ADD COLUMN "organizationId" TEXT;
UPDATE "page_versions" c SET "organizationId" = p."organizationId" FROM "pages" p WHERE p."id" = c."pageId";
ALTER TABLE "page_versions" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "page_versions" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- page_tags
ALTER TABLE "page_tags" ADD COLUMN "organizationId" TEXT;
UPDATE "page_tags" c SET "organizationId" = p."organizationId" FROM "pages" p WHERE p."id" = c."pageId";
ALTER TABLE "page_tags" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "page_tags" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- documents
ALTER TABLE "documents" ADD COLUMN "organizationId" TEXT;
UPDATE "documents" d SET "organizationId" = COALESCE(
  (SELECT p."organizationId" FROM "pages" p WHERE p."id" = d."pageId"),
  (SELECT s."organizationId" FROM "spaces" s WHERE s."id" = d."spaceId")
);
ALTER TABLE "documents" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- document_versions
ALTER TABLE "document_versions" ADD COLUMN "organizationId" TEXT;
UPDATE "document_versions" c SET "organizationId" = p."organizationId" FROM "documents" p WHERE p."id" = c."documentId";
ALTER TABLE "document_versions" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "document_versions" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- course_sections
ALTER TABLE "course_sections" ADD COLUMN "organizationId" TEXT;
UPDATE "course_sections" c SET "organizationId" = p."organizationId" FROM "courses" p WHERE p."id" = c."courseId";
ALTER TABLE "course_sections" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "course_sections" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- course_steps
ALTER TABLE "course_steps" ADD COLUMN "organizationId" TEXT;
UPDATE "course_steps" c SET "organizationId" = p."organizationId" FROM "courses" p WHERE p."id" = c."courseId";
ALTER TABLE "course_steps" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "course_steps" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- course_assignments
ALTER TABLE "course_assignments" ADD COLUMN "organizationId" TEXT;
UPDATE "course_assignments" c SET "organizationId" = p."organizationId" FROM "courses" p WHERE p."id" = c."courseId";
ALTER TABLE "course_assignments" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "course_assignments" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- enrollments
ALTER TABLE "enrollments" ADD COLUMN "organizationId" TEXT;
UPDATE "enrollments" c SET "organizationId" = p."organizationId" FROM "courses" p WHERE p."id" = c."courseId";
ALTER TABLE "enrollments" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "enrollments" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- step_progress
ALTER TABLE "step_progress" ADD COLUMN "organizationId" TEXT;
UPDATE "step_progress" c SET "organizationId" = p."organizationId" FROM "enrollments" p WHERE p."id" = c."enrollmentId";
ALTER TABLE "step_progress" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "step_progress" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();

-- quiz_attempts
ALTER TABLE "quiz_attempts" ADD COLUMN "organizationId" TEXT;
UPDATE "quiz_attempts" c SET "organizationId" = p."organizationId" FROM "enrollments" p WHERE p."id" = c."enrollmentId";
ALTER TABLE "quiz_attempts" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "quiz_attempts" ALTER COLUMN "organizationId" SET DEFAULT app_org_id();


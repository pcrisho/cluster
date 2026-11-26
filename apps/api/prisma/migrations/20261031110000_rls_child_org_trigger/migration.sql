-- A child row takes its organization from its parent, and can never belong to another one.
-- Fills "organizationId" when the insert leaves it NULL (seed, system client, nested creates with
-- no context) and rejects a row whose parent is in another organization: foreign-key checks
-- ignore row-level security, this does not (the parent lookup runs as the caller, so under RLS a
-- parent of another organization is simply not found). Arguments: pairs of (parent table, column).
CREATE FUNCTION org_from_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i int := 0;
  ref text;
  parent_org text;
BEGIN
  WHILE i < TG_NARGS LOOP
    ref := to_jsonb(NEW) ->> TG_ARGV[i + 1];
    IF ref IS NOT NULL THEN
      EXECUTE format('SELECT "organizationId" FROM %I WHERE "id" = $1', TG_ARGV[i])
        INTO parent_org USING ref;
      IF parent_org IS NULL THEN
        RAISE EXCEPTION '%: % % not found in this organization', TG_TABLE_NAME, TG_ARGV[i], ref
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF NEW."organizationId" IS NULL THEN
        NEW."organizationId" := parent_org;
      ELSIF NEW."organizationId" <> parent_org THEN
        RAISE EXCEPTION '%: organization differs from its % %', TG_TABLE_NAME, TG_ARGV[i], ref
          USING ERRCODE = 'foreign_key_violation';
      END IF;
      RETURN NEW;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "userId", "organizationId" ON "user_profiles" FOR EACH ROW EXECUTE FUNCTION org_from_parent('User', 'userId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "userId", "organizationId" ON "user_capabilities" FOR EACH ROW EXECUTE FUNCTION org_from_parent('User', 'userId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "userId", "organizationId" ON "notifications" FOR EACH ROW EXECUTE FUNCTION org_from_parent('User', 'userId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "targetUserId", "organizationId" ON "celebration_reactions" FOR EACH ROW EXECUTE FUNCTION org_from_parent('User', 'targetUserId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "postId", "organizationId" ON "PostLike" FOR EACH ROW EXECUTE FUNCTION org_from_parent('Post', 'postId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "postId", "organizationId" ON "PostComment" FOR EACH ROW EXECUTE FUNCTION org_from_parent('Post', 'postId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "spaceId", "organizationId" ON "space_access" FOR EACH ROW EXECUTE FUNCTION org_from_parent('spaces', 'spaceId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "spaceId", "organizationId" ON "pages" FOR EACH ROW EXECUTE FUNCTION org_from_parent('spaces', 'spaceId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "pageId", "organizationId" ON "page_versions" FOR EACH ROW EXECUTE FUNCTION org_from_parent('pages', 'pageId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "pageId", "organizationId" ON "page_tags" FOR EACH ROW EXECUTE FUNCTION org_from_parent('pages', 'pageId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "pageId", "spaceId", "organizationId" ON "documents" FOR EACH ROW EXECUTE FUNCTION org_from_parent('pages', 'pageId', 'spaces', 'spaceId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "documentId", "organizationId" ON "document_versions" FOR EACH ROW EXECUTE FUNCTION org_from_parent('documents', 'documentId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "courseId", "organizationId" ON "course_sections" FOR EACH ROW EXECUTE FUNCTION org_from_parent('courses', 'courseId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "courseId", "organizationId" ON "course_steps" FOR EACH ROW EXECUTE FUNCTION org_from_parent('courses', 'courseId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "courseId", "organizationId" ON "course_assignments" FOR EACH ROW EXECUTE FUNCTION org_from_parent('courses', 'courseId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "courseId", "organizationId" ON "enrollments" FOR EACH ROW EXECUTE FUNCTION org_from_parent('courses', 'courseId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "enrollmentId", "organizationId" ON "step_progress" FOR EACH ROW EXECUTE FUNCTION org_from_parent('enrollments', 'enrollmentId');
CREATE TRIGGER org_from_parent BEFORE INSERT OR UPDATE OF "enrollmentId", "organizationId" ON "quiz_attempts" FOR EACH ROW EXECUTE FUNCTION org_from_parent('enrollments', 'enrollmentId');

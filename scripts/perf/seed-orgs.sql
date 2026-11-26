-- Several organizations sharing the database, for the index plans of the RLS spec (docs/specs/org/rls, T11).
-- Run by `db.sh orgs` after `db.sh setup` (it needs the `cluster` organization and lucia.garcia@cluster.example).
--
-- Adds 4 organizations of 400 people (10 spaces of 150 pages, 600 posts, 30 notifications per person), and to
-- every organization, cluster included: 20 areas, 15 positions, a profile for each person without one,
-- 20 published courses (3 sections × 4 lessons) each assigned to an area, ~5 enrolments per person with
-- their progress, and 20 000 audit entries over a year. The plans are taken for cluster, so the
-- other organizations' rows are what an index leading with organizationId has to skip.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE perf_orgs AS
SELECT gen_random_uuid()::text AS id, 'Perf Org ' || k AS name, 'perf-org-' || k AS slug FROM generate_series(1, 4) k;
INSERT INTO "Organization"(id, name, slug, "updatedAt") SELECT id, name, slug, now() FROM perf_orgs;

CREATE TEMP TABLE all_orgs AS
SELECT id FROM perf_orgs UNION ALL SELECT id FROM "Organization" WHERE slug = 'cluster';

INSERT INTO "User"(id, email, "passwordHash", "firstName", "lastName", role, "organizationId", "passwordSetAt", "updatedAt")
SELECT gen_random_uuid(), 'u' || g || '@' || o.slug || '.test', t."passwordHash", 'Person', o.slug || '-' || g,
       (CASE WHEN g = 1 THEN 'ADMIN' ELSE 'COLLABORATOR' END)::"UserRole", o.id, now(), now()
FROM perf_orgs o, generate_series(1, 400) g, (SELECT "passwordHash" FROM "User" WHERE email = 'lucia.garcia@cluster.example') t;

CREATE TEMP TABLE org_admin AS
SELECT DISTINCT ON ("organizationId") "organizationId" AS org, id FROM "User" WHERE role = 'ADMIN' ORDER BY "organizationId", "createdAt";

INSERT INTO org_nodes(id, name, "sortOrder", "organizationId", "updatedAt")
SELECT gen_random_uuid(), 'Perf area ' || g, g, o.id, now() FROM all_orgs o, generate_series(1, 20) g;

INSERT INTO positions(id, name, "organizationId", "createdById", "updatedAt")
SELECT gen_random_uuid(), 'Perf position ' || g, o.id, a.id, now()
FROM all_orgs o JOIN org_admin a ON a.org = o.id, generate_series(1, 15) g;

-- Round robin over the perf areas and positions; the organization's own profiles are left alone.
WITH u AS (SELECT id, "organizationId" AS org, row_number() OVER (PARTITION BY "organizationId" ORDER BY id) rn
             FROM "User" WHERE NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p."userId" = "User".id)),
     n AS (SELECT id, "organizationId" AS org, row_number() OVER (PARTITION BY "organizationId" ORDER BY id) - 1 i
             FROM org_nodes WHERE name LIKE 'Perf area %'),
     p AS (SELECT id, "organizationId" AS org, row_number() OVER (PARTITION BY "organizationId" ORDER BY id) - 1 i
             FROM positions WHERE name LIKE 'Perf position %')
INSERT INTO user_profiles(id, "userId", "orgNodeId", "positionId", "joinedAt", "updatedAt")
SELECT gen_random_uuid(), u.id, n.id, p.id, now() - (u.rn || ' days')::interval, now()
FROM u JOIN n ON n.org = u.org AND n.i = u.rn % 20 JOIN p ON p.org = u.org AND p.i = u.rn % 15;

-- KNOW and CONNECT for the new organizations (cluster has seed.sql's).
INSERT INTO spaces(id, name, restricted, "organizationId", "createdBy", "updatedAt")
SELECT gen_random_uuid(), 'Space ' || g, g % 4 = 0, o.id, a.id, now()
FROM perf_orgs o JOIN org_admin a ON a.org = o.id, generate_series(1, 10) g;

INSERT INTO pages(id, title, content, "searchText", status, "order", "spaceId", "authorId", "ydocRevision", "updatedAt", "publishedAt")
SELECT gen_random_uuid(), 'Page ' || g,
       jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph',
         'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', repeat(md5(s.id || g) || ' ', 25)))))),
       repeat(md5(s.id || g) || ' lorem ipsum dolor ', 25), 'PUBLISHED', g, s.id, s."createdBy", 0, now(), now()
FROM spaces s JOIN perf_orgs o ON o.id = s."organizationId", generate_series(1, 150) g;

INSERT INTO "Post"(id, type, title, body, excerpt, "authorId", "organizationId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'POST', 'Post ' || g, repeat('hello world ', 60), 'excerpt', a.id, o.id,
       now() - (g || ' minutes')::interval, now()
FROM perf_orgs o JOIN org_admin a ON a.org = o.id, generate_series(1, 600) g;

INSERT INTO "PostLike"(id, "postId", "userId")
SELECT gen_random_uuid(), p.id, u.id
FROM "Post" p JOIN perf_orgs o ON o.id = p."organizationId"
CROSS JOIN LATERAL (SELECT id FROM "User" WHERE "organizationId" = o.id ORDER BY random() LIMIT 3) u;

INSERT INTO "PostComment"(id, body, "postId", "authorId", "updatedAt")
SELECT gen_random_uuid(), 'nice one', p.id, u.id, now()
FROM "Post" p JOIN perf_orgs o ON o.id = p."organizationId"
CROSS JOIN LATERAL (SELECT id FROM "User" WHERE "organizationId" = o.id ORDER BY random() LIMIT 2) u;

INSERT INTO notifications(id, "userId", type, title, body, link, "readAt", "createdAt")
SELECT gen_random_uuid(), u.id, 'connect:post:liked', 'Someone liked your post', 'body', '/connect/feed',
       CASE WHEN g % 3 = 0 THEN NULL ELSE now() END, now() - (g || ' hours')::interval
FROM "User" u JOIN perf_orgs o ON o.id = u."organizationId", generate_series(1, 30) g;

-- GROW for every organization.
INSERT INTO courses(id, "organizationId", title, status, "createdById", "publishedAt", "updatedAt")
SELECT gen_random_uuid(), o.id, 'Perf course ' || g, 'PUBLISHED', a.id, now(), now()
FROM all_orgs o JOIN org_admin a ON a.org = o.id, generate_series(1, 20) g;

INSERT INTO course_sections(id, "courseId", title, position)
SELECT gen_random_uuid(), c.id, 'Section ' || s, s FROM courses c, generate_series(1, 3) s WHERE c.title LIKE 'Perf course %';

INSERT INTO course_steps(id, "courseId", "sectionId", type, title, position, content)
SELECT gen_random_uuid(), cs."courseId", cs.id, 'LESSON', 'Lesson ' || s, s,
       '{"kind": "text", "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Read this."}]}]}}'
FROM course_sections cs JOIN courses c ON c.id = cs."courseId", generate_series(1, 4) s WHERE c.title LIKE 'Perf course %';

-- Course n is mandatory for perf area n.
INSERT INTO course_assignments(id, "courseId", "orgNodeId", "dueInDays", "createdById")
SELECT gen_random_uuid(), c.id, n.id, 30, c."createdById"
FROM courses c JOIN org_nodes n ON n."organizationId" = c."organizationId"
 AND n.name = 'Perf area ' || split_part(c.title, ' ', 3);

-- About 5 courses per person; a third completed, the rest half way.
INSERT INTO enrollments(id, "courseId", "userId", status, "startedAt", "completedAt")
SELECT gen_random_uuid(), c.id, u.id,
       (CASE WHEN u.rn % 3 = 0 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END)::"EnrollmentStatus",
       now() - interval '20 days', CASE WHEN u.rn % 3 = 0 THEN now() - interval '2 days' END
FROM (SELECT id, "organizationId" AS org, row_number() OVER (PARTITION BY "organizationId" ORDER BY id) rn FROM "User") u
JOIN (SELECT id, "organizationId" AS org, row_number() OVER (PARTITION BY "organizationId" ORDER BY id) rn
        FROM courses WHERE title LIKE 'Perf course %') c ON c.org = u.org AND (u.rn + c.rn) % 4 = 0;

INSERT INTO step_progress("enrollmentId", "stepId")
SELECT e.id, s.id FROM enrollments e JOIN course_steps s ON s."courseId" = e."courseId"
WHERE e.status = 'COMPLETED' OR s.position <= 2;

INSERT INTO audit_log(id, "actorId", action, "entityType", "entityId", "newValues", "organizationId", "createdAt")
SELECT gen_random_uuid(), a.id, 'UPDATE', 'Organization', o.id, '{"name": "x"}', o.id, now() - (g * 26 || ' minutes')::interval
FROM all_orgs o JOIN org_admin a ON a.org = o.id, generate_series(1, 20000) g;

COMMIT;
ANALYZE;

-- Synthetic data for the load scripts. Run by db.sh against the dedicated cluster_perf database,
-- after `prisma migrate deploy` and the normal seed (it needs org `cluster`, admin@cluster.example and
-- lucia.garcia@cluster.example, whose password hash the synthetic users copy: Cluster-team-2026).
--
-- Size (what a company of ~100 people might have after a year; tune the generate_series bounds):
--   100 users, 15 spaces (4 restricted; Space 1 holds 1000 pages), 3000 pages (~4 KB of text each),
--   1500 posts, 6000 likes, 4500 comments, 60 notifications per user.
-- The text repeats md5 hashes, so Postgres compresses it far better than real prose: searches on real
-- content cost at least as much as measured here.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User"(id, email, "passwordHash", "firstName", "lastName", role, "isActive", "organizationId", "passwordSetAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'perf' || g || '@cluster.example', t."passwordHash", 'Perf', 'User' || g, 'COLLABORATOR', true, t."organizationId", now(), now(), now()
FROM generate_series(1, 100) g,
     (SELECT * FROM "User" WHERE email = 'lucia.garcia@cluster.example') t;

INSERT INTO spaces(id, name, restricted, "organizationId", "createdBy", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Space ' || g, g % 4 = 0, o.id, a.id, now(), now()
FROM generate_series(1, 15) g,
     (SELECT id FROM "Organization" WHERE slug = 'cluster' LIMIT 1) o,
     (SELECT id FROM "User" WHERE email = 'admin@cluster.example') a;

-- No ydoc: collab builds it from content the first time a page is opened (what a real page does).
WITH sp AS (SELECT id, row_number() OVER (ORDER BY name) rn FROM spaces WHERE name LIKE 'Space %'),
     adm AS (SELECT id FROM "User" WHERE email = 'admin@cluster.example')
INSERT INTO pages(id, title, content, "searchText", status, "order", "spaceId", "authorId", "ydocRevision", "createdAt", "updatedAt", "publishedAt")
SELECT gen_random_uuid(), 'Page ' || g,
       jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
         jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
           jsonb_build_object('type', 'text', 'text', repeat(md5(g::text) || ' ', 100)))))),
       repeat(md5(g::text) || ' lorem ipsum dolor ', 100),
       'PUBLISHED', g,
       (SELECT id FROM sp WHERE rn = CASE WHEN g <= 1000 THEN 1 ELSE 2 + (g % 14) END),
       (SELECT id FROM adm), 0,
       now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval, now()
FROM generate_series(1, 3000) g;

INSERT INTO "Post"(id, type, "isPinned", title, body, excerpt, "authorId", "organizationId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'POST', false, 'Post ' || g, repeat('hello world ', 60), 'excerpt',
       (SELECT id FROM "User" ORDER BY random() LIMIT 1),
       (SELECT id FROM "Organization" WHERE slug = 'cluster'),
       now() - (g || ' minutes')::interval, now()
FROM generate_series(1, 1500) g;

INSERT INTO "PostLike"(id, "postId", "userId", "createdAt")
SELECT gen_random_uuid(), p.id, u.id, now()
FROM (SELECT id FROM "Post") p CROSS JOIN LATERAL (SELECT id FROM "User" ORDER BY random() LIMIT 4) u;

INSERT INTO "PostComment"(id, body, "postId", "authorId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'nice one', p.id, u.id, now(), now()
FROM (SELECT id FROM "Post") p CROSS JOIN LATERAL (SELECT id FROM "User" ORDER BY random() LIMIT 3) u;

INSERT INTO notifications(id, "userId", type, title, body, link, "readAt", "createdAt")
SELECT gen_random_uuid(), u.id, 'connect:post:liked', 'Someone liked your post', 'body', '/connect/feed',
       CASE WHEN g % 3 = 0 THEN NULL ELSE now() END, now() - (g || ' hours')::interval
FROM "User" u, generate_series(1, 60) g;

COMMIT;
ANALYZE;

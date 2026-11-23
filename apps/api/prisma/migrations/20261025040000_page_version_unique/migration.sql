-- Two simultaneous snapshots could share a number; renumber any existing repeats, then forbid them.
UPDATE "page_versions" pv SET "version" = r.n
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "pageId" ORDER BY "createdAt", "id") AS n FROM "page_versions") r
WHERE pv."id" = r."id";
CREATE UNIQUE INDEX "page_versions_pageId_version_key" ON "page_versions"("pageId", "version");

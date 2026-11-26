-- Plain-text copy of each page body, matched by search.
ALTER TABLE "pages" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
UPDATE "pages" SET "searchText" = COALESCE((SELECT string_agg(t #>> '{}', ' ') FROM jsonb_path_query("content", '$.**.text') t), '');

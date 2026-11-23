import type { PrismaClient } from "@prisma/client";
import { StorageService } from "../storage/storage.service";

const IMAGE_KEY =
  /^organizations\/[^/]+\/(pages|spaces)\/[^/]+\/images\/[^/]+$/;
/** An upload is stored a moment before the editor saves it into the body. */
const DEFAULT_GRACE_MS = 60 * 60 * 1000;

/**
 * Page and space images that no page body, saved version or space description references. A
 * one-off for files left behind before images were deleted as they left the body; `apply` deletes them. `prefix`
 * narrows the sweep (the e2e shares its bucket with dev, whose pages its database does not know).
 */
export async function sweepOrphanImages(
  prisma: Pick<PrismaClient, "$queryRaw">,
  storage: StorageService,
  options: { apply: boolean; graceMs?: number; prefix?: string },
): Promise<string[]> {
  const referenced = new Set(
    (
      await prisma.$queryRaw<{ key: string }[]>`
        SELECT unnest(regexp_matches("content"::text, '"(organizations/[^"]+)"', 'g')) AS "key" FROM "pages"
        UNION
        SELECT unnest(regexp_matches("content"::text, '"(organizations/[^"]+)"', 'g')) AS "key" FROM "page_versions"
        UNION
        SELECT unnest(regexp_matches("descriptionContent"::text, '"(organizations/[^"]+)"', 'g')) AS "key" FROM "spaces"`
    ).map((row) => row.key),
  );
  const oldEnough = Date.now() - (options.graceMs ?? DEFAULT_GRACE_MS);

  const orphans = (
    await storage.listObjects(options.prefix ?? "organizations/")
  )
    .filter(
      (o) =>
        IMAGE_KEY.test(o.name) &&
        !referenced.has(o.name) &&
        o.lastModified.getTime() < oldEnough,
    )
    .map((o) => o.name);

  if (options.apply) for (const key of orphans) await storage.deleteFile(key);
  return orphans;
}

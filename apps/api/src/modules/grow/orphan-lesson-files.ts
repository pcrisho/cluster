import type { PrismaClient } from "@prisma/client";
import { StorageService } from "../storage/storage.service";

const LESSON_FILE_KEY = /^organizations\/[^/]+\/grow\/[^/]+\/[^/]+$/;
/** A file is stored a moment before the lesson that holds it is saved. */
const DEFAULT_GRACE_MS = 60 * 60 * 1000;

/**
 * Lesson videos and files that no step references: what a crash between storing a video and saving
 * the lesson leaves, a file taken out of a lesson, or the files of a deleted step. `apply` deletes
 * them. `prefix` narrows the sweep (the e2e shares its bucket with dev, whose steps its database
 * does not know). Run it against the database that owns the bucket.
 */
export async function sweepOrphanLessonFiles(
  prisma: Pick<PrismaClient, "$queryRaw">,
  storage: StorageService,
  options: { apply: boolean; graceMs?: number; prefix?: string },
): Promise<string[]> {
  const referenced = new Set(
    (
      await prisma.$queryRaw<{ key: string }[]>`
        SELECT unnest(regexp_matches("content"::text, '"(organizations/[^"]+)"', 'g')) AS "key" FROM "course_steps"`
    ).map((row) => row.key),
  );
  const oldEnough = Date.now() - (options.graceMs ?? DEFAULT_GRACE_MS);

  const orphans = (
    await storage.listObjects(options.prefix ?? "organizations/")
  )
    .filter(
      (o) =>
        LESSON_FILE_KEY.test(o.name) &&
        !referenced.has(o.name) &&
        o.lastModified.getTime() < oldEnough,
    )
    .map((o) => o.name);

  if (options.apply) for (const key of orphans) await storage.deleteFile(key);
  return orphans;
}

// Lists the lesson videos and files nothing references; with --apply, deletes them.
//   dev: pnpm --filter @cluster/api storage:sweep-lesson-files [--apply]   server: docker compose exec api node dist/scripts/sweep-lesson-files.js [--apply]
import { sweepOrphanLessonFiles } from "../modules/grow/orphan-lesson-files";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { StorageService } from "../modules/storage/storage.service";

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new SystemPrismaService();
  try {
    const orphans = await sweepOrphanLessonFiles(prisma, new StorageService(), {
      apply,
    });
    for (const key of orphans) console.log(key);
    console.log(
      `${orphans.length} orphan lesson file(s) ${apply ? "deleted" : "found (dry run, pass --apply to delete)"}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

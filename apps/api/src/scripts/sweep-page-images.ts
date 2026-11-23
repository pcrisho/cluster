// Lists the page and space images nothing references; with --apply, deletes them.
//   dev: pnpm --filter @cluster/api storage:sweep-images [--apply]   server: docker compose exec api node dist/scripts/sweep-page-images.js [--apply]
import { sweepOrphanImages } from "../modules/know/orphan-images";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { StorageService } from "../modules/storage/storage.service";

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new SystemPrismaService();
  try {
    const orphans = await sweepOrphanImages(prisma, new StorageService(), {
      apply,
    });
    for (const key of orphans) console.log(key);
    console.log(
      `${orphans.length} orphan image(s) ${apply ? "deleted" : "found (dry run, pass --apply to delete)"}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

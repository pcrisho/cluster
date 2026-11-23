import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { readdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/** Streamed uploads wait on local disk under this name until they are stored. */
export const UPLOAD_TEMP_PREFIX = "cluster-upload-";

/** Where streamed uploads wait: `UPLOAD_TMP_DIR`, else the system temp folder (memory on some hosts). */
export const uploadTmpDir = () => process.env.UPLOAD_TMP_DIR || tmpdir();

export const uploadTempPath = () =>
  join(uploadTmpDir(), `${UPLOAD_TEMP_PREFIX}${randomUUID()}`);

/** Removes our temporary upload files not touched for `maxAgeMs`; returns how many went. */
export async function sweepStaleUploads(
  dir: string,
  maxAgeMs: number,
  now = Date.now(),
): Promise<number> {
  const names = await readdir(dir).catch(() => [] as string[]);
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith(UPLOAD_TEMP_PREFIX)) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (!info || now - info.mtimeMs < maxAgeMs) continue;
    await rm(path, { force: true });
    removed++;
  }
  return removed;
}

/** Longer than the hour a slow upload may take, so a file still arriving (here or in another instance) stays. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** A crash or a restart in the middle of an upload leaves its temporary file; clear them on start. */
@Injectable()
export class UploadTempSweeper implements OnModuleInit {
  private readonly logger = new Logger(UploadTempSweeper.name);

  async onModuleInit() {
    const removed = await sweepStaleUploads(
      uploadTmpDir(),
      STALE_AFTER_MS,
    ).catch((error: unknown) => {
      this.logger.warn(`Could not sweep temporary uploads: ${String(error)}`);
      return 0;
    });
    if (removed > 0)
      this.logger.log(`Removed ${removed} stale temporary upload file(s)`);
  }
}

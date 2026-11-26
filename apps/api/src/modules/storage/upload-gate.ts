import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { mkdir, statfs } from "fs/promises";
import { uploadTmpDir } from "./upload-temp";

/** Videos in flight at once, per API instance. */
export const MAX_CONCURRENT_UPLOADS = 3;
/** Documents (50 MB, received to disk by multer) in flight at once, per API instance; a separate count so videos never block them. */
export const MAX_CONCURRENT_DOCUMENT_UPLOADS = 10;

export type GatedKind = "video" | "document";
const LIMIT: Record<GatedKind, number> = {
  video: MAX_CONCURRENT_UPLOADS,
  document: MAX_CONCURRENT_DOCUMENT_UPLOADS,
};
/** Free space that must remain after the uploads in flight are written. */
export const FREE_SPACE_MARGIN = 512 * 1024 * 1024;

const freeBytesOfTempDir = async () => {
  const dir = uploadTmpDir();
  await mkdir(dir, { recursive: true });
  const stats = await statfs(dir);
  return stats.bavail * stats.bsize;
};

/**
 * Lets an upload received to disk start only if the API is not already busy with others of its kind
 * and the temp folder has room for it: the file waits there (up to 1 GB) until it is stored, and on a
 * host whose temp folder is memory (tmpfs) that room is RAM. Counts what each upload announced in
 * Content-Length; the room is shared by both kinds.
 */
@Injectable()
export class UploadGate {
  private active: Record<GatedKind, number> = { video: 0, document: 0 };
  private reserved = 0;
  /** Replaceable so tests can set the room available. */
  readFreeBytes: () => Promise<number> = freeBytesOfTempDir;

  /** Returns the function that gives the slot back; refuses with 503 (busy) or 507 (no room). */
  async acquire(bytes: number, kind: GatedKind): Promise<() => void> {
    if (this.active[kind] >= LIMIT[kind])
      throw new HttpException(
        {
          code: "UPLOAD_BUSY",
          message:
            "Other files are being uploaded. Try again in a few minutes.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    // Taken before the await below so that uploads arriving together cannot all pass the check.
    const reservedBefore = this.reserved;
    this.active[kind]++;
    this.reserved += bytes;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active[kind]--;
      this.reserved -= bytes;
    };
    try {
      const free = await this.readFreeBytes();
      if (free - reservedBefore - bytes < FREE_SPACE_MARGIN)
        throw new HttpException(
          {
            code: "UPLOAD_NO_SPACE",
            message:
              "The server has no room for this file right now. Try again later or ask an administrator.",
          },
          HttpStatus.INSUFFICIENT_STORAGE,
        );
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }
}

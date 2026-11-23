import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/decorators";
import { bestEffort } from "../../common/best-effort";
import { acceptFile } from "../storage/file-rules";
import { fileUrl, orgKeyPrefix } from "../storage/file-url";
import { StorageService } from "../storage/storage.service";
import {
  buildImageKey,
  imageFolder,
  ownerFolder,
  type MediaOwner,
} from "./media-owner";
import { SpaceAccessService } from "./space-access.service";

/** Files stored under a page or a space: inline images and document versions. */
@Injectable()
export class KnowMediaService {
  private readonly logger = new Logger(KnowMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: SpaceAccessService,
  ) {}

  /** Removes everything a page or a space stored. Failures are logged, never thrown. */
  deleteFolder(orgId: string, owner: MediaOwner) {
    return bestEffort(`delete files of ${owner.kind} ${owner.id}`, () =>
      this.storage.deletePrefix(ownerFolder(orgId, owner)),
    );
  }

  /**
   * Deletes the images a body or a description no longer shows, unless a page, a saved version
   * or a space description still references them (history and restores need them). Only keys
   * under `within` (default: every page and space of the organization) are considered.
   * Failures are logged, never thrown.
   */
  deleteUnusedImages(
    orgId: string,
    keys: Iterable<string>,
    within: string[] = [
      `${orgKeyPrefix(orgId)}pages/`,
      `${orgKeyPrefix(orgId)}spaces/`,
    ],
  ) {
    return bestEffort("delete unused images", async () => {
      for (const key of keys) {
        if (!within.some((prefix) => key.startsWith(prefix))) continue;
        const [{ used }] = await this.prisma.$queryRaw<{ used: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM "pages" WHERE strpos("content"::text, ${key}::text) > 0)
              OR EXISTS (SELECT 1 FROM "page_versions" WHERE strpos("content"::text, ${key}::text) > 0)
              OR EXISTS (SELECT 1 FROM "spaces" WHERE strpos("descriptionContent"::text, ${key}::text) > 0) AS "used"`;
        if (!used) await this.storage.deleteFile(key);
      }
    });
  }

  async uploadImage(
    user: AuthenticatedUser,
    owner: MediaOwner,
    upload: Express.Multer.File | undefined,
  ): Promise<{ key: string; url: string }> {
    const { file, extension } = await acceptFile("image", upload);
    await this.access.requireOwner(user, owner, "WRITE");

    const key = buildImageKey(user.orgId, owner, extension);
    await this.storage.putObject(key, file);
    return { key, url: fileUrl(key) };
  }

  async deleteImage(
    user: AuthenticatedUser,
    owner: MediaOwner,
    key: string,
  ): Promise<void> {
    await this.access.requireOwner(user, owner, "WRITE");

    if (!key || !key.startsWith(imageFolder(user.orgId, owner))) {
      throw new ForbiddenException(
        `File not accessible from this ${owner.kind}`,
      );
    }

    try {
      await this.storage.deleteFile(key);
    } catch (err) {
      this.logger.warn(
        `Failed to delete ${owner.kind} image ${key}: ${(err as Error).message}`,
      );
    }
  }
}

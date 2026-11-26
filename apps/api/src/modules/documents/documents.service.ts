import { randomUUID } from "crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Readable } from "stream";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { AuthenticatedUser } from "../../common/decorators";
import { audit } from "../../common/audit.helper";
import { documentOwner, type MediaOwner } from "../know/media-owner";
import { SpaceAccessService } from "../know/space-access.service";
import { orgKeyPrefix } from "../storage/file-url";
import { acceptFile } from "../storage/file-rules";
import { buildDocumentKey } from "./document.constants";
import { toDocumentDto, toVersionDto } from "./document-dto";

/**
 * Documents service — versioned file attachments that belong to
 * a KNOW page or a KNOW space (exactly one, enforced by a CHECK
 * constraint). SpaceAccessService decides who may read or write
 * them through their owner.
 *
 * Versioning model:
 *   - Each `Document` has 1..N `DocumentVersion` rows.
 *   - `Document.currentVersionId` points to the "live" version
 *     (i.e. the one rendered in the editor / tab).
 *   - Old versions are kept for restore + audit; only the
 *     `currentVersion` is exposed in the editor / tab.
 *   - Versions are immutable: to "modify" a file, you create a
 *     new version (the previous one stays in history).
 *
 * Deleting a document removes its rows and every stored version file.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: SpaceAccessService,
  ) {}

  // ── Create document (v1) ───────────────────────────────

  async createDocument(
    user: AuthenticatedUser,
    owner: MediaOwner,
    file: Express.Multer.File | undefined,
    name: string | undefined,
    note: string | undefined,
  ) {
    const { orgId, id: userId } = user;
    const accepted = await acceptFile("document", file);

    await this.access.requireOwner(user, owner, "WRITE");

    const documentId = randomUUID();
    const version = 1;
    const key = buildDocumentKey(
      orgId,
      owner,
      documentId,
      version,
      accepted.extension,
    );

    // Upload to storage first; only create the DB row if upload
    // succeeds. (If the DB write fails, the stored object is
    // orphaned — a future GC can clean it up. We log it for now.)
    await this.storage.putObject(key, accepted.file);

    let created;
    try {
      created = await this.prisma.document.create({
        data: {
          id: documentId,
          pageId: owner.kind === "page" ? owner.id : null,
          spaceId: owner.kind === "space" ? owner.id : null,
          name: name?.trim() || accepted.name,
          versionsCount: 1,
          createdById: userId,
          versions: {
            create: {
              version,
              mimetype: accepted.mime,
              size: accepted.file.size,
              key,
              authorId: userId,
              note: note ?? null,
            },
          },
        },
        include: { versions: true },
      });
    } catch (err) {
      this.logger.error(
        `Failed to create document after the storage upload; orphan key=${key}: ${(err as Error).message}`,
      );
      throw err;
    }

    const v1 = created.versions[0];

    // Wire the currentVersion pointer. Done in a second
    // statement because the version row was just created and we
    // need its id.
    await this.prisma.document.update({
      where: { id: created.id },
      data: { currentVersionId: v1.id },
    });

    await audit(this.prisma, {
      action: "Document.CREATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Document",
      entityId: created.id,
      newValues: {
        pageId: created.pageId,
        spaceId: created.spaceId,
        name: created.name,
        version: 1,
        mimetype: v1.mimetype,
        size: v1.size,
      },
    });

    return toDocumentDto(created, v1);
  }

  // ── List documents of a page or a space ────────────────

  async listDocuments(user: AuthenticatedUser, owner: MediaOwner) {
    await this.access.requireOwner(user, owner, "READ");

    const docs = await this.prisma.document.findMany({
      where:
        owner.kind === "page" ? { pageId: owner.id } : { spaceId: owner.id },
      orderBy: { updatedAt: "desc" },
      include: { currentVersion: true },
    });
    return docs.map((d) => toDocumentDto(d, d.currentVersion));
  }

  /**
   * A document of the user's organization whose page or space they may use for this (404 if
   * they cannot see it). Writing needs EDIT on a page and MANAGE on a space.
   */
  private async documentFor(
    user: AuthenticatedUser,
    documentId: string,
    need: "READ" | "WRITE",
  ) {
    const doc = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        OR: [
          { page: { space: { organizationId: user.orgId } } },
          { space: { organizationId: user.orgId } },
        ],
      },
      include: { currentVersion: true },
    });
    if (!doc) throw new NotFoundException("Document not found");
    await this.access.requireOwner(user, documentOwner(doc), need);
    return doc;
  }

  // ── List versions ───────────────────────────────────────

  async listVersions(user: AuthenticatedUser, documentId: string) {
    // We piggy-back on getDocument for the access check.
    await this.documentFor(user, documentId, "READ");

    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: "desc" },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return versions;
  }

  // ── New version ─────────────────────────────────────────

  async createVersion(
    user: AuthenticatedUser,
    documentId: string,
    file: Express.Multer.File | undefined,
    note: string | undefined,
  ) {
    const { orgId, id: userId } = user;
    const accepted = await acceptFile("document", file);

    const doc = await this.documentFor(user, documentId, "WRITE");

    // Mimetype MUST match the existing one. Allowing a mimetype
    // change would silently break the FileCard renderer (which
    // chose its icon based on the v1 mimetype).
    if (accepted.mime !== doc.currentVersion?.mimetype) {
      throw new BadRequestException(
        `New version mimetype must match the document's existing mimetype (${doc.currentVersion?.mimetype})`,
      );
    }

    const nextVersion = doc.versionsCount + 1;
    const key = buildDocumentKey(
      orgId,
      documentOwner(doc),
      doc.id,
      nextVersion,
      accepted.extension,
    );

    await this.storage.putObject(key, accepted.file);

    let newVersion;
    try {
      newVersion = await this.prisma.documentVersion.create({
        data: {
          documentId: doc.id,
          version: nextVersion,
          mimetype: accepted.mime,
          size: accepted.file.size,
          key,
          authorId: userId,
          note: note ?? null,
        },
      });
      await this.prisma.document.update({
        where: { id: doc.id },
        data: {
          currentVersionId: newVersion.id,
          versionsCount: nextVersion,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record document version; orphan key=${key}: ${(err as Error).message}`,
      );
      throw err;
    }

    await audit(this.prisma, {
      action: "DocumentVersion.CREATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "DocumentVersion",
      entityId: newVersion.id,
      newValues: {
        documentId: doc.id,
        version: nextVersion,
        mimetype: accepted.mime,
        size: accepted.file.size,
      },
    });

    return toVersionDto(doc.id, newVersion);
  }

  // ── Download specific version ───────────────────────────

  async openVersion(
    user: AuthenticatedUser,
    documentId: string,
    versionId: string,
  ): Promise<{ name: string; stream: Readable; contentType: string }> {
    const doc = await this.documentFor(user, documentId, "READ");

    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
    });
    if (!version) throw new NotFoundException("Version not found");
    if (!version.key.startsWith(orgKeyPrefix(user.orgId))) {
      throw new ForbiddenException(
        "File not accessible from this organization",
      );
    }

    const file = await this.storage.getFileStream(version.key);
    return { name: doc.name, ...file };
  }

  // ── Restore specific version as current ────────────────

  async restoreVersion(
    user: AuthenticatedUser,
    documentId: string,
    versionId: string,
  ): Promise<{ id: string; currentVersionId: string }> {
    const { orgId, id: userId } = user;
    await this.documentFor(user, documentId, "WRITE");

    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
    });
    if (!version) throw new NotFoundException("Version not found");

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { currentVersionId: versionId },
    });

    await audit(this.prisma, {
      action: "Document.UPDATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Document",
      entityId: documentId,
      oldValues: { currentVersionId: "(previous)" },
      newValues: { currentVersionId: versionId, version: version.version },
    });

    return { id: updated.id, currentVersionId: updated.currentVersionId ?? "" };
  }

  // ── Delete ──────────────────────────────────────────────

  async remove(user: AuthenticatedUser, documentId: string): Promise<void> {
    const { orgId, id: userId } = user;
    const doc = await this.documentFor(user, documentId, "WRITE");

    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      select: { key: true },
    });
    await this.prisma.document.delete({ where: { id: documentId } });
    for (const { key } of versions) {
      try {
        await this.storage.deleteFile(key);
      } catch (err) {
        this.logger.warn(
          `Failed to delete document file ${key}: ${(err as Error).message}`,
        );
      }
    }

    await audit(this.prisma, {
      action: "Document.DELETE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Document",
      entityId: documentId,
      oldValues: { name: doc.name },
    });
  }
}

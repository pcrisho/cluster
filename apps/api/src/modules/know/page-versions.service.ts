import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { extractText } from "@cluster/editor-schema";
import { audit } from "../../common/audit.helper";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { CollabClient } from "../collab/collab.client";
import { assertPageContent } from "./know-validation";
import { pageDocumentName } from "./page-collab.provider";
import { SpaceAccessService } from "./space-access.service";

@Injectable()
export class PageVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly collab: CollabClient,
  ) {}

  /**
   * The page as last saved. Once a page has a live document its edits reach the row a few seconds
   * late, so collab saves them first; without collab the version could miss what people just wrote.
   */
  private async savedPage<T extends { id: string; ydocRevision: number }>(
    page: T,
  ) {
    if (page.ydocRevision === 0) return page;
    await this.collab.flush(pageDocumentName(page.id));
    return this.prisma.page.findUniqueOrThrow({ where: { id: page.id } });
  }

  /**
   * Stores the page's current title and content as its next version. Two
   * snapshots at once can pick the same number; the unique index rejects the
   * loser, which simply takes the following one.
   */
  async snapshot(
    page: { id: string; title: string; content: Prisma.JsonValue },
    authorId: string,
  ) {
    for (let attempt = 0; ; attempt++) {
      const last = await this.prisma.pageVersion.aggregate({
        where: { pageId: page.id },
        _max: { version: true },
      });
      try {
        return await this.prisma.pageVersion.create({
          data: {
            pageId: page.id,
            title: page.title,
            content: (page.content ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            authorId,
            version: (last._max.version ?? 0) + 1,
          },
        });
      } catch (err) {
        const clash =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002";
        if (!clash || attempt >= 5) throw err;
      }
    }
  }

  /** Versions are created explicitly ("Save version"); autosave never creates one. */
  async create(user: AuthenticatedUser, pageId: string) {
    const page = await this.savedPage(
      await this.access.requireEditablePage(user, pageId),
    );
    const version = await this.snapshot(page, user.id);

    await audit(this.prisma, {
      action: "PageVersion.CREATE",
      actorId: user.id,
      organizationId: user.orgId,
      entityType: "PageVersion",
      entityId: version.id,
      newValues: { pageId, version: version.version },
    });

    return { success: true, data: version };
  }

  async list(user: AuthenticatedUser, pageId: string) {
    await this.access.requirePage(user, pageId, "EDIT");

    // Bodies stay out of the list; `get` returns one with its content.
    const versions = await this.prisma.pageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
      omit: { content: true },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return { success: true, data: versions };
  }

  async get(user: AuthenticatedUser, pageId: string, versionId: string) {
    await this.access.requirePage(user, pageId, "EDIT");

    const version = await this.prisma.pageVersion.findFirst({
      where: { id: versionId, pageId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!version) throw new NotFoundException("Version not found");

    return { success: true, data: version };
  }

  /**
   * Restoring keeps the current state as a version first, so it can be undone from the history. A
   * live page gets the body through collab (editors see it arrive and can undo it); the title is
   * left as it is.
   */
  async restore(user: AuthenticatedUser, pageId: string, versionId: string) {
    const page = await this.access.requireEditablePage(user, pageId);

    const version = await this.prisma.pageVersion.findFirst({
      where: { id: versionId, pageId },
    });
    if (!version) throw new NotFoundException("Version not found");
    // Versions saved before the schema rules existed may no longer be valid.
    assertPageContent(version.content, user.orgId);

    await this.snapshot(await this.savedPage(page), user.id);
    const restored =
      page.ydocRevision === 0
        ? await this.prisma.page.update({
            where: { id: pageId },
            data: {
              title: version.title,
              content: (version.content ??
                Prisma.JsonNull) as Prisma.InputJsonValue,
              searchText: extractText(version.content),
            },
          })
        : await this.replaceLive(pageId, version.content);

    await audit(this.prisma, {
      action: "Page.UPDATE",
      actorId: user.id,
      organizationId: user.orgId,
      entityType: "Page",
      entityId: pageId,
      newValues: { restoredVersion: version.version },
    });

    return { success: true, data: restored };
  }

  private async replaceLive(pageId: string, body: Prisma.JsonValue) {
    await this.collab.replace(pageDocumentName(pageId), body);
    return this.prisma.page.findUniqueOrThrow({ where: { id: pageId } });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PageStatus, Prisma } from "@prisma/client";
import { extractText } from "@cluster/editor-schema";
import { audit } from "../../common/audit.helper";
import { bestEffort } from "../../common/best-effort";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { CollabClient } from "../collab/collab.client";
import { CreatePageDto } from "./dto/create-page.dto";
import { MovePageDto } from "./dto/move-page.dto";
import { UpdatePageDto } from "./dto/update-page.dto";
import { UpdatePageStatusDto } from "./dto/update-page-status.dto";
import { assertIconFields, assertPageContent } from "./know-validation";
import { toPageDto } from "./page-dto";
import { insertAt } from "./page-order";
import { pageDocumentName } from "./page-collab.provider";
import { KnowMediaService } from "./know-media.service";
import { pageOwner } from "./media-owner";
import { PageVersionsService } from "./page-versions.service";
import { allows } from "./space-access";
import { SpaceAccessService } from "./space-access.service";

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly versions: PageVersionsService,
    private readonly media: KnowMediaService,
    private readonly collab: CollabClient,
  ) {}

  async tree(user: AuthenticatedUser, spaceId: string) {
    const role = await this.access.requireSpace(user, spaceId, "READ");

    const where: Prisma.PageWhereInput = { spaceId };
    if (!allows(role, "EDIT")) where.status = PageStatus.PUBLISHED;

    const pages = await this.prisma.page.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        order: true,
        spaceId: true,
        parentId: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        iconType: true,
        icon: true,
        emoji: true,
        author: { select: { id: true, firstName: true, lastName: true } },
        lastEditedBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { children: true, versions: true } },
      },
    });

    // The tree is navigation only: bodies are fetched with the page.
    const data = pages.map((p) => toPageDto({ ...p, content: null }));
    return { success: true, data };
  }

  async get(user: AuthenticatedUser, pageId: string) {
    const { role } = await this.access.requirePage(user, pageId, "READ");
    const page = await this.prisma.page.findUniqueOrThrow({
      where: { id: pageId },
      include: {
        space: { select: { id: true, name: true } },
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        tags: { include: { tag: true } },
        _count: { select: { versions: true, children: true } },
      },
    });

    return {
      success: true,
      data: {
        ...toPageDto(page),
        space: { ...page.space, myRole: role },
        author: page.author,
        tags: page.tags,
        _count: page._count,
      },
    };
  }

  async create(user: AuthenticatedUser, spaceId: string, dto: CreatePageDto) {
    const { orgId, id: userId } = user;
    await this.access.requireSpace(user, spaceId, "EDIT");

    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, organizationId: orgId },
    });
    if (!space) throw new NotFoundException("Space not found");

    if (dto.parentId) {
      const parent = await this.prisma.page.findFirst({
        where: { id: dto.parentId, spaceId },
      });
      if (!parent)
        throw new BadRequestException({
          code: "PAGE_PARENT_INVALID",
          message: "Parent page not found in this space",
        });
    }

    // Defaults are applied before validating, so a client that only sends
    // `title` is not rejected for a missing `icon`.
    const status = dto.status ?? PageStatus.PUBLISHED;
    const iconType = dto.iconType ?? "LUCIDE";
    const resolvedIcon =
      iconType === "LUCIDE" ? (dto.icon ?? "file-text") : null;
    const resolvedEmoji = iconType === "EMOJI" ? (dto.emoji ?? null) : null;
    assertIconFields(iconType, resolvedIcon, resolvedEmoji);

    if (dto.content) assertPageContent(dto.content, orgId);

    const page = await this.prisma.page.create({
      data: {
        title: dto.title?.trim() ?? "",
        ...(dto.content
          ? {
              content: dto.content as Prisma.InputJsonValue,
              searchText: extractText(dto.content),
            }
          : {}),
        status,
        spaceId,
        parentId: dto.parentId ?? null,
        authorId: userId,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        iconType,
        icon: iconType === "LUCIDE" ? resolvedIcon : "file-text",
        emoji: iconType === "EMOJI" ? resolvedEmoji : null,
      },
    });

    await this.versions.snapshot(page, userId);

    if (dto.tagIds && dto.tagIds.length > 0) {
      const tags = await this.prisma.tag.findMany({
        where: { id: { in: dto.tagIds }, organizationId: orgId },
      });
      if (tags.length !== dto.tagIds.length) {
        throw new BadRequestException("One or more tags not found");
      }

      await this.prisma.pageTag.createMany({
        data: dto.tagIds.map((tagId) => ({ pageId: page.id, tagId })),
      });
    }

    await audit(this.prisma, {
      action: "Page.CREATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Page",
      entityId: page.id,
      newValues: { title: page.title, status: page.status },
    });

    return { success: true, data: toPageDto(page) };
  }

  async update(user: AuthenticatedUser, pageId: string, dto: UpdatePageDto) {
    const { orgId, id: userId } = user;
    const page = await this.access.requireEditablePage(user, pageId);

    // Validate the merged result so a partial patch cannot contradict the current state.
    assertIconFields(
      dto.iconType ?? page.iconType,
      dto.icon === undefined ? page.icon : dto.icon,
      dto.emoji === undefined ? page.emoji : dto.emoji,
    );

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === "PUBLISHED" && !page.publishedAt) {
        data.publishedAt = new Date();
      }
    }
    if (dto.iconType !== undefined) data.iconType = dto.iconType;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.emoji !== undefined) data.emoji = dto.emoji;

    // PATCH never creates a version: with autosave at 1500 ms that would flood
    // page_versions. Versions come from POST /pages/:id/versions.

    if (dto.tagIds !== undefined) {
      await this.prisma.pageTag.deleteMany({ where: { pageId } });

      const validTags = await this.prisma.tag.findMany({
        where: { id: { in: dto.tagIds }, organizationId: orgId },
      });

      if (validTags.length > 0) {
        await this.prisma.pageTag.createMany({
          data: validTags.map((tag) => ({ pageId, tagId: tag.id })),
        });
      }
    }

    const updated = await this.prisma.page.update({
      where: { id: pageId },
      data,
    });
    // A draft or archived page is no longer open to everyone who could read it.
    if (dto.status !== undefined) await this.recheckPage(pageId);

    await audit(this.prisma, {
      action: "Page.UPDATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Page",
      entityId: pageId,
      oldValues: { title: page.title, status: page.status },
      newValues: { title: updated.title, status: updated.status },
    });

    return { success: true, data: toPageDto(updated) };
  }

  /**
   * Moves a page under another page of the same space (or to the root) at a position among its new
   * siblings, and renumbers those siblings so the order is stable.
   */
  async move(user: AuthenticatedUser, pageId: string, dto: MovePageDto) {
    const page = await this.access.requireEditablePage(user, pageId);
    const parentId = dto.parentId === undefined ? page.parentId : dto.parentId;

    if (parentId) {
      const parent = await this.prisma.page.findFirst({
        where: { id: parentId, spaceId: page.spaceId },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException({
          code: "PAGE_PARENT_INVALID",
          message: "Parent page not found in this space",
        });
      }
    }
    await this.assertNoCycle(pageId, parentId);

    const siblings = await this.prisma.page.findMany({
      where: { spaceId: page.spaceId, parentId, id: { not: pageId } },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: { id: true, updatedAt: true },
    });
    const ordered = insertAt(
      siblings.map((s) => s.id),
      pageId,
      dto.index,
    );
    // Moving is not an edit: each page keeps its own updatedAt (Prisma would stamp "now").
    const edited = new Map(siblings.map((s) => [s.id, s.updatedAt]));
    edited.set(pageId, page.updatedAt);
    await this.prisma.$transaction(
      ordered.map((id, order) =>
        this.prisma.page.update({
          where: { id },
          data: {
            order,
            updatedAt: edited.get(id),
            ...(id === pageId ? { parentId } : {}),
          },
        }),
      ),
    );

    await audit(this.prisma, {
      action: "Page.UPDATE",
      actorId: user.id,
      organizationId: user.orgId,
      entityType: "Page",
      entityId: pageId,
      oldValues: { parentId: page.parentId },
      newValues: { parentId },
    });

    return { success: true };
  }

  async remove(user: AuthenticatedUser, pageId: string) {
    const { orgId, id: userId } = user;
    const page = await this.access.requireEditablePage(user, pageId);

    const children = await this.prisma.page.count({
      where: { parentId: pageId },
    });
    if (children > 0) {
      throw new BadRequestException(
        "Cannot delete a page that has child pages. Remove or reparent child pages first.",
      );
    }

    await this.prisma.page.delete({ where: { id: pageId } });
    await this.media.deleteFolder(orgId, pageOwner(pageId));
    await bestEffort("collab close", () =>
      this.collab.close(pageDocumentName(pageId)),
    );

    await audit(this.prisma, {
      action: "Page.DELETE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Page",
      entityId: pageId,
      oldValues: { title: page.title },
    });

    return { success: true };
  }

  async updateStatus(
    user: AuthenticatedUser,
    pageId: string,
    dto: UpdatePageStatusDto,
  ) {
    const { orgId, id: userId } = user;
    const page = await this.access.requireEditablePage(user, pageId);

    const data: Record<string, unknown> = { status: dto.status };
    if (dto.status === "PUBLISHED" && !page.publishedAt) {
      data.publishedAt = new Date();
    }

    const updated = await this.prisma.page.update({
      where: { id: pageId },
      data,
    });
    await this.recheckPage(pageId);

    await audit(this.prisma, {
      action: "Page.UPDATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Page",
      entityId: pageId,
      oldValues: { status: page.status },
      newValues: { status: updated.status },
    });

    return { success: true, data: updated };
  }

  private recheckPage(pageId: string) {
    return bestEffort("collab recheck", () =>
      this.collab.recheck({ scope: "page", id: pageId }),
    );
  }

  /**
   * Rejects a `newParentId` that would make the page a descendant of itself, by
   * walking the parent chain upward. A pre-existing cycle ends the walk.
   */
  private async assertNoCycle(
    pageId: string,
    newParentId: string | null,
  ): Promise<void> {
    if (!newParentId) return;
    if (newParentId === pageId) {
      throw new BadRequestException({
        code: "PAGE_PARENT_INVALID",
        message: "A page cannot be its own parent",
      });
    }
    let cursor: string | null = newParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === pageId) {
        throw new BadRequestException({
          code: "PAGE_PARENT_INVALID",
          message: "Cannot reparent: would create a cycle",
        });
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const parent: { parentId: string | null } | null =
        await this.prisma.page.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = parent?.parentId ?? null;
    }
  }
}

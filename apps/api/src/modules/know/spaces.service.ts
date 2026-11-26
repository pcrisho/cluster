import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { audit } from "../../common/audit.helper";
import { bestEffort } from "../../common/best-effort";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { CollabClient } from "../collab/collab.client";
import { isCrosser } from "../org/partition";
import { PartitionService } from "../org/partition.service";
import { CreateSpaceDto } from "./dto/create-space.dto";
import { UpdateSpaceDto } from "./dto/update-space.dto";
import { assertIconFields } from "./know-validation";
import { pageDocumentName } from "./page-collab.provider";
import { spaceDocumentName } from "./space-collab.provider";
import { KnowMediaService } from "./know-media.service";
import { pageOwner, spaceOwner } from "./media-owner";
import { SpaceAccessService } from "./space-access.service";
import { toSpaceDto } from "./space-dto";

@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly media: KnowMediaService,
    private readonly collab: CollabClient,
    private readonly partition: PartitionService,
  ) {}

  /** Under isolation only a crosser may make a space visible to every main node (node-partitions rule 5). */
  private assertMayOpen(user: AuthenticatedUser, isolated: boolean) {
    if (isolated && !isCrosser(user))
      throw new ForbiddenException({
        code: "ISOLATION_OPEN_SPACE",
        message: "Only a person who sees every main node can make a space visible to all of them",
      });
  }

  async list(user: AuthenticatedUser, search?: string) {
    const roles = await this.access.rolesInOrg(user);
    const where: Prisma.SpaceWhereInput = {
      organizationId: user.orgId,
      id: { in: [...roles.keys()] },
    };
    if (search) {
      where.name = { contains: search.trim(), mode: "insensitive" };
    }

    const spaces = await this.prisma.space.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { pages: true } } },
    });

    const creatorIds = [...new Set(spaces.map((s) => s.createdBy))];
    const creators =
      creatorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const creatorById = new Map(creators.map((u) => [u.id, u]));

    const data = spaces.map((s) =>
      toSpaceDto(
        s,
        user.orgId,
        roles.get(s.id) ?? "VIEWER",
        creatorById.get(s.createdBy) ?? null,
      ),
    );

    return { success: true, data };
  }

  async get(user: AuthenticatedUser, spaceId: string) {
    const role = await this.access.requireSpace(user, spaceId, "READ");
    const space = await this.prisma.space.findUniqueOrThrow({
      where: { id: spaceId },
      include: { _count: { select: { pages: true } } },
    });
    return { success: true, data: toSpaceDto(space, user.orgId, role) };
  }

  async create(user: AuthenticatedUser, dto: CreateSpaceDto) {
    const { orgId, id: userId } = user;
    if (
      user.role !== UserRole.ADMIN &&
      !user.capabilities.includes("KNOW_SPACE_CREATE")
    ) {
      throw new ForbiddenException(
        "You do not have permission to create spaces",
      );
    }

    const iconType = dto.iconType ?? "LUCIDE";
    assertIconFields(
      iconType,
      iconType === "LUCIDE" ? (dto.icon ?? "book-open") : null,
      dto.emoji ?? null,
    );
    const isolated = await this.partition.isolated(orgId);
    if (dto.restricted === false) this.assertMayOpen(user, isolated);

    const space = await this.prisma.space.create({
      data: {
        name: dto.name,
        icon: iconType === "LUCIDE" ? (dto.icon ?? "book-open") : "book-open",
        iconType,
        emoji: iconType === "EMOJI" ? (dto.emoji ?? null) : null,
        descriptionContent:
          dto.descriptionContent == null
            ? Prisma.JsonNull
            : (dto.descriptionContent as Prisma.InputJsonValue),
        restricted: dto.restricted ?? isolated,
        organizationId: orgId,
        createdBy: userId,
        // Whoever creates a space manages it.
        access: { create: { role: "MANAGER", userId, createdById: userId } },
      },
    });

    await audit(this.prisma, {
      action: "Space.CREATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Space",
      entityId: space.id,
      newValues: {
        name: space.name,
        iconType: space.iconType,
        emoji: space.emoji,
      },
    });

    return { success: true, data: toSpaceDto(space, orgId, "MANAGER") };
  }

  async update(user: AuthenticatedUser, spaceId: string, dto: UpdateSpaceDto) {
    const { orgId, id: userId } = user;
    const role = await this.access.requireSpace(user, spaceId, "MANAGE");

    const existing = await this.prisma.space.findFirst({
      where: { id: spaceId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException("Space not found");
    // Saving an already open space with restricted:false changes nothing, so it is not "opening" it.
    if (dto.restricted === false && existing.restricted)
      this.assertMayOpen(user, await this.partition.isolated(orgId));

    // Validate the merged result so a partial patch cannot contradict the current state.
    assertIconFields(
      dto.iconType ?? existing.iconType,
      dto.icon === undefined ? existing.icon : dto.icon,
      dto.emoji === undefined ? existing.emoji : dto.emoji,
    );

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.restricted !== undefined) data.restricted = dto.restricted;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.iconType !== undefined) data.iconType = dto.iconType;
    if (dto.emoji !== undefined) data.emoji = dto.emoji;

    const space = await this.prisma.space.update({
      where: { id: spaceId },
      data,
    });
    // Restricting or opening a space changes who can open its pages.
    if (dto.restricted !== undefined)
      await bestEffort("collab recheck", () =>
        this.collab.recheck({ scope: "all" }),
      );

    await audit(this.prisma, {
      action: "Space.UPDATE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Space",
      entityId: spaceId,
      oldValues: {
        name: existing.name,
        iconType: existing.iconType,
        emoji: existing.emoji,
      },
      newValues: {
        name: space.name,
        iconType: space.iconType,
        emoji: space.emoji,
      },
    });

    return { success: true, data: toSpaceDto(space, orgId, role) };
  }

  async remove(user: AuthenticatedUser, spaceId: string) {
    const { orgId, id: userId } = user;
    await this.access.requireSpace(user, spaceId, "MANAGE");
    if (
      user.role !== UserRole.ADMIN &&
      !user.capabilities.includes("KNOW_SPACE_DELETE")
    ) {
      throw new ForbiddenException(
        "You do not have permission to delete spaces",
      );
    }

    const existing = await this.prisma.space.findFirst({
      where: { id: spaceId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException("Space not found");

    const pages = await this.prisma.page.findMany({
      where: { spaceId },
      select: { id: true, ydocRevision: true },
    });
    await this.prisma.space.delete({ where: { id: spaceId } });
    await Promise.all([
      this.media.deleteFolder(orgId, spaceOwner(spaceId)),
      ...pages.map((p) => this.media.deleteFolder(orgId, pageOwner(p.id))),
    ]);
    // Only a page or a description that was opened in live editing can have a document in collab.
    await Promise.all(
      pages
        .filter((p) => p.ydocRevision > 0)
        .map((p) =>
          bestEffort("collab close", () =>
            this.collab.close(pageDocumentName(p.id)),
          ),
        ),
    );
    if (existing.ydocRevision > 0)
      await bestEffort("collab close", () =>
        this.collab.close(spaceDocumentName(spaceId)),
      );

    await audit(this.prisma, {
      action: "Space.DELETE",
      actorId: userId,
      organizationId: orgId,
      entityType: "Space",
      entityId: spaceId,
      oldValues: { name: existing.name },
    });

    return { success: true };
  }
}

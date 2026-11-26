import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { audit, diff } from "../../common/audit.helper";
import type { ActorContext } from "../../common/decorators";
import type { PartitionScope } from "./partition";
import { CreatePositionDto } from "./dto/create-position.dto";
import { UpdatePositionDto } from "./dto/update-position.dto";

@Injectable()
export class PositionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List positions. By default only active. Admins can pass includeInactive=true.
   */
  async list(orgId: string, includeInactive = false, scope: PartitionScope = { all: true }) {
    const nodeIds = scope.all ? undefined : Array.from(scope.nodeIds);
    const positions = await this.prisma.position.findMany({
      where: {
        organizationId: orgId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(nodeIds && { OR: [{ orgNodeId: null }, { orgNodeId: { in: nodeIds } }] }),
      },
      orderBy: { name: "asc" },
      include: {
        // A partition counts only its own people: a global position must not reveal the others.
        _count: { select: { profiles: { where: nodeIds ? { orgNodeId: { in: nodeIds } } : {} } } },
        orgNode: { select: { id: true, name: true } },
      },
    });
    return { success: true, data: positions };
  }

  /**
   * List positions compatible with a given orgNode (global + scoped-to-this-node).
   * Admin use, e.g. for the user-assignment UI.
   */
  async listAvailableForNode(orgId: string, nodeId: string) {
    const positions = await this.prisma.position.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [{ orgNodeId: null }, { orgNodeId: nodeId }],
      },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { profiles: true } },
        orgNode: { select: { id: true, name: true } },
      },
    });
    return { success: true, data: positions };
  }

  async create(orgId: string, dto: CreatePositionDto, actor: ActorContext) {
    if (dto.orgNodeId) {
      const node = await this.prisma.orgNode.findFirst({
        where: { id: dto.orgNodeId, organizationId: orgId, isActive: true },
        select: { id: true },
      });
      if (!node) {
        throw new BadRequestException({
          code: "ORG_NODE_NOT_FOUND",
          message: "OrgNode not found or inactive in this organization",
        });
      }
    }

    try {
      const position = await this.prisma.position.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          color: dto.color ?? null,
          orgNodeId: dto.orgNodeId ?? null,
          organizationId: orgId,
          createdById: actor.userId,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId: actor.userId,
          organizationId: orgId,
          action: "Position.CREATE",
          entityType: "Position",
          entityId: position.id,
          newValues: {
            name: position.name,
            description: position.description,
            color: position.color,
            orgNodeId: position.orgNodeId,
          } as Prisma.InputJsonValue,
          ipAddress: actor.ipAddress ?? null,
          userAgent: actor.userAgent ?? null,
        },
      });

      return { success: true, data: position };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException({
          code: "POSITION_DUPLICATE_NAME",
          message:
            "A position with that name already exists in this area.",
        });
      }
      throw e;
    }
  }

  async update(
    orgId: string,
    positionId: string,
    dto: UpdatePositionDto,
    actor: ActorContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.position.findFirst({
        where: { id: positionId, organizationId: orgId },
      });
      if (!before) throw new NotFoundException("Position not found");

      const data: Record<string, unknown> = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.color !== undefined) data.color = dto.color;
      if (dto.orgNodeId !== undefined) {
        if (dto.orgNodeId) {
          const node = await tx.orgNode.findFirst({
            where: { id: dto.orgNodeId, organizationId: orgId, isActive: true },
            select: { id: true },
          });
          if (!node) {
            throw new BadRequestException({
              code: "ORG_NODE_NOT_FOUND",
              message: "OrgNode not found or inactive",
            });
          }
        }
        data.orgNodeId = dto.orgNodeId;
      }

      try {
        const after = await tx.position.update({
          where: { id: positionId },
          data,
        });

        const changes = diff(
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
        );
        await audit(tx, {
          action: "Position.UPDATE",
          actorId: actor.userId,
          organizationId: orgId,
          entityType: "Position",
          entityId: positionId,
          oldValues: changes.oldValues,
          newValues: changes.newValues,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });

        return { success: true, data: after };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new ConflictException({
            code: "POSITION_DUPLICATE_NAME",
            message:
              "A position with that name already exists in this area.",
          });
        }
        throw e;
      }
    });
  }

  /**
   * Soft-archive: set isActive=false. Users keep their positionId reference.
   */
  async archive(orgId: string, positionId: string, actor: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const position = await tx.position.findFirst({
        where: { id: positionId, organizationId: orgId },
      });
      if (!position) throw new NotFoundException("Position not found");
      if (!position.isActive)
        throw new BadRequestException("Position already archived");

      const after = await tx.position.update({
        where: { id: positionId },
        data: { isActive: false },
      });

      await audit(tx, {
        action: "Position.ARCHIVE",
        actorId: actor.userId,
        organizationId: orgId,
        entityType: "Position",
        entityId: positionId,
        oldValues: { isActive: true },
        newValues: { isActive: false },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return { success: true, data: after };
    });
  }

  /**
   * Hard delete. Rejects if users still reference this position.
   */
  async delete(orgId: string, positionId: string, actor: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const position = await tx.position.findFirst({
        where: { id: positionId, organizationId: orgId },
        include: { _count: { select: { profiles: true } } },
      });
      if (!position) throw new NotFoundException("Position not found");

      if (position._count.profiles > 0) {
        throw new BadRequestException({
          code: "POSITION_HAS_USERS",
          message: `Cannot delete — ${position._count.profiles} users still have this position. Archive instead.`,
          params: { count: position._count.profiles },
        });
      }

      await tx.position.delete({ where: { id: positionId } });

      await audit(tx, {
        action: "Position.DELETE",
        actorId: actor.userId,
        organizationId: orgId,
        entityType: "Position",
        entityId: positionId,
        oldValues: {
          name: position.name,
          usageCount: position._count.profiles,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return { success: true };
    });
  }

}

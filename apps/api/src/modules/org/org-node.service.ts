import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CollabClient } from "../collab/collab.client";
import type { RecheckScope } from "../collab/collab.client";
import {
  wouldCreateCycle,
  getDepthFromParent,
} from "../../common/cycle-detector";
import { audit, diff } from "../../common/audit.helper";
import { isCrosser, mainNodeOf, type PartitionScope } from "./partition";
import { PartitionService } from "./partition.service";
import { bestEffort } from "../../common/best-effort";
import type { ActorContext } from "../../common/decorators";
import { CreateOrgNodeDto } from "./dto/create-org-node.dto";
import { UpdateOrgNodeDto } from "./dto/update-org-node.dto";
import { MoveOrgNodeDto } from "./dto/move-org-node.dto";
import { placeBefore, subtreeHeight } from "./org-tree";

const MAX_DEPTH = 6

/**
 * The new node would sit one level below `parentId`; the root is level 1.
 */
async function assertDepthAllowed(
  tx: Prisma.TransactionClient,
  orgId: string,
  parentId: string,
) {
  const ancestors = await getDepthFromParent(tx, orgId, parentId)
  if (ancestors + 2 > MAX_DEPTH) {
    throw new BadRequestException({
      code: "ORG_DEPTH_EXCEEDED",
      message: `Maximum depth (${MAX_DEPTH} levels) exceeded`,
      params: { max: MAX_DEPTH },
    })
  }
}

/** The unique constraint that fired: a person can manage only one area; names are unique per parent. */
function uniqueViolation(e: unknown): ConflictException | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002")
    return null
  const constraint = (
    e.meta as
      | { driverAdapterError?: { cause?: { constraint?: { index?: string; fields?: string[] } } } }
      | undefined
  )?.driverAdapterError?.cause?.constraint
  const hit = (index: string, field: string) =>
    constraint?.index === index || constraint?.fields?.includes(field)
  if (hit("org_nodes_managerId_key", "managerId"))
    return new ConflictException({
      code: "ORG_MANAGER_BUSY",
      message: "That person is already manager of another area",
    })
  if (hit("org_nodes_organizationId_code_key", "code"))
    return new ConflictException({
      code: "NODE_CODE_TAKEN",
      message: "Another area already uses that code.",
    })
  return new ConflictException({
    code: "ORG_NODE_DUPLICATE_NAME",
    message: "An area with that name already exists under the same parent.",
  })
}

/** Only a main node (no parent) can be external. */
function notMain() {
  return new BadRequestException({
    code: "NODE_NOT_MAIN",
    message: "Only a main node can be external",
  })
}

/** A user as the manager check needs them: role, superadmin flag, capabilities and the node of their profile. */
const MANAGER_PARTITION_SELECT = {
  role: true,
  isSuperAdmin: true,
  capabilities: { select: { capability: true } },
  profile: { select: { orgNodeId: true } },
} as const;

@Injectable()
export class OrgNodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabClient,
    private readonly partitions: PartitionService,
  ) {}

  /**
   * Rule 8 (docs/specs/org/node-partitions): while isolated, the manager of `nodeId` sits in that node's main node
   * or is a crosser. Callers pass the parent for a new node (it joins the parent's partition), or null for a new root: only a crosser.
   */
  private async assertManagerInPartition(
    tx: Prisma.TransactionClient,
    orgId: string,
    manager: { role: string; isSuperAdmin: boolean; capabilities: { capability: string }[]; profile: { orgNodeId: string | null } | null },
    nodeId: string | null,
  ) {
    const nodes = await tx.orgNode.findMany({
      where: { organizationId: orgId },
      select: { id: true, parentId: true },
    });
    const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
    const main = mainNodeOf(nodeId, parentOf);
    const sameMain = main !== null && mainNodeOf(manager.profile?.orgNodeId ?? null, parentOf) === main;
    const crosser = isCrosser({ ...manager, capabilities: manager.capabilities.map((c) => c.capability) });
    if (!sameMain && !crosser) {
      throw new ConflictException({
        code: "MANAGER_OTHER_PARTITION",
        message: "The manager of an area must belong to its main node or be an administrator",
      });
    }
  }

  /** Active areas whose manager is neither in the area's main node nor a crosser (rule 8). */
  private async strandedManagers(tx: Prisma.TransactionClient, orgId: string): Promise<Set<string>> {
    const nodes = await tx.orgNode.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, parentId: true, manager: { select: MANAGER_PARTITION_SELECT } },
    });
    const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
    const stranded = new Set<string>();
    for (const { id, manager } of nodes) {
      if (!manager) continue;
      const crosser = isCrosser({ ...manager, capabilities: manager.capabilities.map((c) => c.capability) });
      if (!crosser && mainNodeOf(manager.profile?.orgNodeId ?? null, parentOf) !== mainNodeOf(id, parentOf)) {
        stranded.add(id);
      }
    }
    return stranded;
  }

  /**
   * A move of people or areas must not leave a manager outside the partition of the area they manage.
   * Only managers stranded by this change count, so an older mismatch does not block unrelated moves.
   */
  private async assertNoNewStrandedManager(tx: Prisma.TransactionClient, orgId: string, before: Set<string> | null) {
    if (!before) return;
    for (const id of await this.strandedManagers(tx, orgId)) {
      if (!before.has(id)) {
        throw new ConflictException({
          code: "MANAGER_OTHER_PARTITION",
          message: "The manager of an area must belong to its main node or be an administrator",
        });
      }
    }
  }

  /** Areas give access to KNOW spaces, so moving one or reassigning people re-authorizes open editors. */
  private recheck(scope: RecheckScope) {
    return bestEffort("collab recheck", () => this.collab.recheck(scope));
  }

  /**
   * Get the full active org chart for an organization.
   * Returns a flat list — client builds the tree.
   */
  async getTree(orgId: string, scope: PartitionScope = { all: true }) {
    const nodes = await this.prisma.orgNode.findMany({
      where: { organizationId: orgId, isActive: true, ...(scope.all ? {} : { id: { in: Array.from(scope.nodeIds) } }) },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      // code and external are admin data: only /areas/full returns them
      omit: { code: true, external: true },
      include: {
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            isActive: true,
          },
        },
        _count: {
          select: { profiles: { where: { user: { isActive: true } } } },
        },
      },
    });
    return { success: true, data: nodes };
  }

  /**
   * Get the full org chart enriched with positions per node.
   * Used by the admin drag-and-drop tree view.
   */
  async getFullTree(orgId: string) {
    const [nodes, positions] = await Promise.all([
      this.prisma.orgNode.findMany({
        where: { organizationId: orgId, isActive: true },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: {
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              isActive: true,
            },
          },
          positions: {
            where: { isActive: true },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              color: true,
              _count: { select: { profiles: true } },
            },
          },
          _count: {
            select: {
              profiles: { where: { user: { isActive: true } } },
            },
          },
        },
      }),
      this.prisma.position.findMany({
        where: { organizationId: orgId, isActive: true, orgNodeId: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { profiles: true } },
        },
      }),
    ]);

    return {
      success: true,
      data: { nodes, globalPositions: positions },
    };
  }

  /**
   * Get the user's org context (for cross-module consumption, e.g. GROW).
   * Returns null fields if user has no orgNode assigned.
   */
  async getUserOrgContext(orgId: string, userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: {
        orgNode: {
          select: {
            id: true,
            name: true,
            managerId: true,
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
        position: { select: { id: true, name: true } },
      },
    });

    if (!profile?.orgNode) {
      return {
        orgNodeId: null,
        orgNodeName: null,
        path: [] as string[],
        manager: null,
        position: null,
      };
    }

    const path = await this.prisma.$queryRaw<{ name: string }[]>`
      WITH RECURSIVE path AS (
        SELECT id, name, "parentId"
        FROM org_nodes
        WHERE id = ${profile.orgNode.id} AND "organizationId" = ${orgId}
        UNION ALL
        SELECT n.id, n.name, n."parentId"
        FROM org_nodes n
        INNER JOIN path p ON n.id = p."parentId"
        WHERE n."organizationId" = ${orgId}
      )
      SELECT name FROM path
    `;

    return {
      orgNodeId: profile.orgNode.id,
      orgNodeName: profile.orgNode.name,
      path: path.reverse().map((p) => p.name),
      manager: profile.orgNode.manager,
      position: profile.position,
    };
  }

  /**
   * Create a new org node.
   */
  async create(orgId: string, dto: CreateOrgNodeDto, actor: ActorContext) {
    const isolated = await this.partitions.isolated(orgId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.external && dto.parentId) throw notMain()
      if (dto.parentId) {
        const parent = await tx.orgNode.findFirst({
          where: { id: dto.parentId, organizationId: orgId, isActive: true },
        });
        if (!parent) throw new NotFoundException("Parent node not found");

        await assertDepthAllowed(tx, orgId, dto.parentId)
      }

      if (dto.managerId) {
        const manager = await tx.user.findFirst({
          where: { id: dto.managerId, organizationId: orgId, isActive: true },
          select: { firstName: true, lastName: true, ...MANAGER_PARTITION_SELECT },
        });
        if (!manager) throw new NotFoundException("Manager not found");

        // Check manager uniqueness via partial unique index (DB will throw if violated)
        const existing = await tx.orgNode.findFirst({
          where: { managerId: dto.managerId },
        });
        if (existing) {
          throw new ConflictException({
            code: "ORG_MANAGER_BUSY",
            message: `User ${manager.firstName} ${manager.lastName} is already manager of another node`,
          });
        }
        // A new root has nobody in its partition yet, so only a crosser can manage it (null node).
        if (isolated) {
          await this.assertManagerInPartition(tx, orgId, manager, dto.parentId ?? null);
        }
      }

      try {
        const node = await tx.orgNode.create({
          data: {
            name: dto.name,
            icon: dto.icon ?? null,
            sortOrder: dto.sortOrder ?? 0,
            parentId: dto.parentId ?? null,
            managerId: dto.managerId ?? null,
            code: dto.code ?? null,
            external: dto.external ?? false,
            organizationId: orgId,
          },
        });

        await audit(tx, {
          action: "OrgNode.CREATE",
          actorId: actor.userId,
          organizationId: orgId,
          entityType: "OrgNode",
          entityId: node.id,
          newValues: {
            name: node.name,
            icon: node.icon,
            parentId: node.parentId,
            managerId: node.managerId,
            code: node.code,
            external: node.external,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });

        return { success: true, data: node };
      } catch (e) {
        throw uniqueViolation(e) ?? e
      }
    });
  }

  /**
   * Update an org node (rename, change manager).
   */
  async update(
    orgId: string,
    nodeId: string,
    dto: UpdateOrgNodeDto,
    actor: ActorContext,
  ) {
    const isolated = await this.partitions.isolated(orgId);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.orgNode.findFirst({
        where: { id: nodeId, organizationId: orgId },
      });
      if (!before) throw new NotFoundException("OrgNode not found");

      if (dto.managerId !== undefined && dto.managerId !== before.managerId) {
        if (dto.managerId) {
          const manager = await tx.user.findFirst({
            where: { id: dto.managerId, organizationId: orgId, isActive: true },
            select: { firstName: true, lastName: true, ...MANAGER_PARTITION_SELECT },
          });
          if (!manager) throw new NotFoundException("Manager not found");

          const existing = await tx.orgNode.findFirst({
            where: { managerId: dto.managerId, NOT: { id: nodeId } },
          });
          if (existing) {
            throw new ConflictException({
              code: "ORG_MANAGER_BUSY",
              message: `User ${manager.firstName} ${manager.lastName} is already manager of another node`,
            });
          }
          if (isolated) await this.assertManagerInPartition(tx, orgId, manager, nodeId);
        }
      }

      if (dto.external && before.parentId !== null) throw notMain();

      const data: Record<string, unknown> = {};
      if (dto.code !== undefined) data.code = dto.code;
      if (dto.external !== undefined) data.external = dto.external;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.icon !== undefined) data.icon = dto.icon;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
      if (dto.managerId !== undefined) data.managerId = dto.managerId;

      try {
        const after = await tx.orgNode.update({ where: { id: nodeId }, data });

        const changes = diff(
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
        );
        await audit(tx, {
          action: "OrgNode.UPDATE",
          actorId: actor.userId,
          organizationId: orgId,
          entityType: "OrgNode",
          entityId: nodeId,
          oldValues: changes.oldValues,
          newValues: changes.newValues,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });

        if (changes.oldValues.managerId !== undefined) {
          await audit(tx, {
            action: "OrgNode.ASSIGN_MANAGER",
            actorId: actor.userId,
            organizationId: orgId,
            entityType: "OrgNode",
            entityId: nodeId,
            oldValues: { managerId: before.managerId },
            newValues: { managerId: after.managerId },
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          });
        }

        return { success: true, data: after };
      } catch (e) {
        throw uniqueViolation(e) ?? e
      }
    });
  }

  /**
   * Move an area under another parent (or to the top level) and/or to a place among its
   * siblings. The siblings are renumbered, so the order never depends on equal `sortOrder`s.
   */
  async move(
    orgId: string,
    nodeId: string,
    dto: MoveOrgNodeDto,
    actor: ActorContext,
  ) {
    const isolated = await this.partitions.isolated(orgId);
    const result = await this.prisma.$transaction(async (tx) => {
      const stranded = isolated ? await this.strandedManagers(tx, orgId) : null;
      const node = await tx.orgNode.findFirst({
        where: { id: nodeId, organizationId: orgId },
      });
      if (!node) throw new NotFoundException("OrgNode not found");

      const parentId =
        dto.newParentId !== undefined ? dto.newParentId : node.parentId
      if (parentId) {
        const newParent = await tx.orgNode.findFirst({
          where: { id: parentId, organizationId: orgId, isActive: true },
        });
        if (!newParent) throw new NotFoundException("New parent not found");
      }
      if (parentId !== node.parentId) {
        if (await wouldCreateCycle(tx, orgId, nodeId, parentId)) {
          throw new BadRequestException({
            code: "ORG_CYCLE",
            message: "Move would create a cycle",
          });
        }
        if (parentId) {
          const active = await tx.orgNode.findMany({
            where: { organizationId: orgId, isActive: true },
            select: { id: true, parentId: true },
          });
          const parentLevel = (await getDepthFromParent(tx, orgId, parentId)) + 1;
          if (parentLevel + subtreeHeight(active, nodeId) > MAX_DEPTH) {
            throw new BadRequestException({
              code: "ORG_DEPTH_EXCEEDED",
              message: `Maximum depth (${MAX_DEPTH} levels) exceeded`,
              params: { max: MAX_DEPTH },
            });
          }
        }
      }

      const siblings = await tx.orgNode.findMany({
        where: { organizationId: orgId, parentId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, sortOrder: true },
      });
      const placed = placeBefore(
        siblings.map((n) => n.id),
        nodeId,
        dto.beforeId,
      );
      if (!placed) throw new NotFoundException("Sibling not found");

      try {
        const sortOrders = new Map(siblings.map((n) => [n.id, n.sortOrder]));
        // A node under another node is no longer a main node, so it cannot stay external.
        const clearsExternal = parentId !== null && node.external;
        let after = node;
        for (const [i, id] of placed.entries()) {
          const sortOrder = (i + 1) * 10;
          if (id === nodeId) {
            after = await tx.orgNode.update({
              where: { id },
              data: { parentId, sortOrder, ...(clearsExternal && { external: false }) },
            });
          } else if (sortOrders.get(id) !== sortOrder) {
            await tx.orgNode.update({ where: { id }, data: { sortOrder } });
          }
        }

        await audit(tx, {
          action: "OrgNode.MOVE",
          actorId: actor.userId,
          organizationId: orgId,
          entityType: "OrgNode",
          entityId: nodeId,
          oldValues: {
            parentId: node.parentId,
            sortOrder: node.sortOrder,
            ...(clearsExternal && { external: true }),
          },
          newValues: {
            parentId: after.parentId,
            sortOrder: after.sortOrder,
            ...(clearsExternal && { external: false }),
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });

        await this.assertNoNewStrandedManager(tx, orgId, stranded);
        return { success: true, data: after };
      } catch (e) {
        throw uniqueViolation(e) ?? e;
      }
    });
    await this.recheck({ scope: "all" });
    return result;
  }

  /**
   * Soft-delete an org node (D-Q2: sets isActive=false, archivedAt=now).
   * Requires reassignTo if the node has children or assigned users.
   */
  async archive(
    orgId: string,
    nodeId: string,
    reassignTo: string,
    actor: ActorContext,
  ) {
    const isolated = await this.partitions.isolated(orgId);
    const result = await this.prisma.$transaction(async (tx) => {
      const stranded = isolated ? await this.strandedManagers(tx, orgId) : null;
      const node = await tx.orgNode.findFirst({
        where: { id: nodeId, organizationId: orgId },
        include: {
          _count: { select: { children: { where: { isActive: true } } } },
          profiles: { where: { user: { isActive: true } } },
        },
      });
      if (!node) throw new NotFoundException("OrgNode not found");
      if (!node.isActive)
        throw new BadRequestException("Node already archived");

      const target = await tx.orgNode.findFirst({
        where: { id: reassignTo, organizationId: orgId, isActive: true },
      });
      if (!target) throw new NotFoundException("Reassign target not found");

      if (node._count.children > 0) {
        throw new BadRequestException({
          code: "ORG_HAS_CHILDREN",
          message:
            "Cannot archive a node with active children. Move or archive children first.",
        });
      }

      const userIds = node.profiles.map((p) => p.userId);
      if (userIds.length > 0) {
        await tx.userProfile.updateMany({
          where: { userId: { in: userIds } },
          data: { orgNodeId: reassignTo, assignmentChangedAt: new Date() },
        });
        for (const userId of userIds) {
          await audit(tx, {
            action: "OrgNode.ASSIGN_USER",
            actorId: actor.userId,
            organizationId: orgId,
            entityType: "UserProfile",
            entityId: userId,
            oldValues: { orgNodeId: nodeId },
            newValues: { orgNodeId: reassignTo },
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          });
        }
      }

      const archived = await tx.orgNode.update({
        where: { id: nodeId },
        // archiving frees the code; the old one stays in the audit row
        data: { isActive: false, archivedAt: new Date(), code: null },
      });

      await audit(tx, {
        action: "OrgNode.ARCHIVE",
        actorId: actor.userId,
        organizationId: orgId,
        entityType: "OrgNode",
        entityId: nodeId,
        oldValues: { isActive: true, ...(node.code !== null && { code: node.code }) },
        newValues: {
          isActive: false,
          archivedAt: archived.archivedAt,
          reassignedUsers: userIds.length,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      await this.assertNoNewStrandedManager(tx, orgId, stranded);
      return { success: true, data: archived };
    });
    await this.recheck({ scope: "all" });
    return result;
  }

  /**
   * Admin-only combined assignment (ADR-001).
   * Sets orgNodeId and/or positionId on a user's profile in one transaction.
   * Validates that the position is compatible with the user's orgNode.
   */
  async setUserAssignment(
    orgId: string,
    userId: string,
    dto: { orgNodeId?: string | null; positionId?: string | null },
    actor: ActorContext,
  ) {
    if (dto.orgNodeId === undefined && dto.positionId === undefined) {
      throw new BadRequestException({
        code: "NO_CHANGES",
        message: "Provide orgNodeId and/or positionId",
      });
    }

    const isolated = await this.partitions.isolated(orgId);
    const clearingNode = dto.orgNodeId === null && isolated;
    const result = await this.prisma.$transaction(async (tx) => {
      const stranded = isolated ? await this.strandedManagers(tx, orgId) : null;
      const user = await tx.user.findFirst({
        where: { id: userId, organizationId: orgId, isActive: true },
        select: { id: true, role: true, isSuperAdmin: true, capabilities: { select: { capability: true } } },
      });
      if (!user) throw new NotFoundException("User not found");
      // Rule 4: while isolated a non-crosser always has an area (docs/specs/org/node-partitions).
      if (clearingNode && !isCrosser({ ...user, capabilities: user.capabilities.map((c) => c.capability) })) {
        throw new BadRequestException({ code: "NODE_REQUIRED", message: "A member needs an area while nodes are isolated" });
      }

      const before = await tx.userProfile.findUnique({
        where: { userId },
        select: { orgNodeId: true, positionId: true },
      });

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

      // The position that will remain after this change must fit the area that will remain.
      const effectiveOrgNodeId =
        dto.orgNodeId !== undefined ? dto.orgNodeId : (before?.orgNodeId ?? null)
      const effectivePositionId =
        dto.positionId !== undefined ? dto.positionId : (before?.positionId ?? null)

      if (effectivePositionId) {
        const position = await tx.position.findFirst({
          where: { id: effectivePositionId, organizationId: orgId },
          select: { orgNodeId: true, name: true, isActive: true },
        })
        if (!position || (dto.positionId && !position.isActive)) {
          throw new NotFoundException("Position not found or inactive")
        }
        if (position.orgNodeId && position.orgNodeId !== effectiveOrgNodeId) {
          throw new BadRequestException({
            code: "POSITION_INCOMPATIBLE",
            message: `Position "${position.name}" is scoped to a different orgNode than the user's`,
          })
        }
      }

      const updateData: Record<string, unknown> = {};
      if (dto.orgNodeId !== undefined) updateData.orgNodeId = dto.orgNodeId;
      if (dto.positionId !== undefined) updateData.positionId = dto.positionId;
      // Anchor of relative LMS due dates: only a real change of area or position moves it.
      if (
        effectiveOrgNodeId !== (before?.orgNodeId ?? null) ||
        effectivePositionId !== (before?.positionId ?? null)
      ) {
        updateData.assignmentChangedAt = new Date();
      }

      await tx.userProfile.upsert({
        where: { userId },
        create: { userId, ...updateData },
        update: updateData,
      });

      await audit(tx, {
        action: "UserProfile.SET_ASSIGNMENT",
        actorId: actor.userId,
        organizationId: orgId,
        entityType: "UserProfile",
        entityId: userId,
        oldValues: {
          orgNodeId: before?.orgNodeId ?? null,
          positionId: before?.positionId ?? null,
        },
        newValues: {
          orgNodeId:
            dto.orgNodeId !== undefined
              ? dto.orgNodeId
              : (before?.orgNodeId ?? null),
          positionId:
            dto.positionId !== undefined
              ? dto.positionId
              : (before?.positionId ?? null),
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      const after = await tx.userProfile.findUnique({
        where: { userId },
        select: { orgNodeId: true, positionId: true },
      });

      await this.assertNoNewStrandedManager(tx, orgId, stranded);
      return { success: true, data: after };
    });
    await this.recheck({ scope: "user", id: userId });
    return result;
  }

}

import { Injectable, NotFoundException } from "@nestjs/common";
import { CourseStatus, Prisma, type CourseAssignment } from "@prisma/client";
import { audit, type AuditAction } from "../../common/audit.helper";
import { bestEffort } from "../../common/best-effort";
import type { ActorContext, AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { principalColumn, principalOf } from "../org/principal";
import { PrincipalService } from "../org/principal.service";
import { usersReachedBy, type Member } from "./assignment-resolution";
import { CourseAccessService } from "./course-access.service";
import { toDateOnly } from "./due-date";
import type {
  AssignmentRulesDto,
  CreateAssignmentDto,
} from "./dto/assignment.dto";

const ENTRY_INCLUDE = {
  user: {
    select: { firstName: true, lastName: true, email: true, isActive: true },
  },
  orgNode: { select: { name: true, parentId: true, isActive: true, archivedAt: true } },
  position: {
    select: { name: true, isActive: true, orgNode: { select: { name: true } } },
  },
} satisfies Prisma.CourseAssignmentInclude;

type EntryRow = Prisma.CourseAssignmentGetPayload<{
  include: typeof ENTRY_INCLUDE;
}>;

/** Who a course is assigned to (person, area with its sub-areas, position), mandatory or not, with a due date. */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly principals: PrincipalService,
    private readonly notifications: NotificationService,
  ) {}

  async list(user: AuthenticatedUser, courseId: string) {
    await this.access.requireCourse(user, courseId, "MANAGE");
    const rows = await this.prisma.courseAssignment.findMany({
      where: { courseId },
      include: ENTRY_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    const org = await this.organization(user.orgId);
    return rows.map((row) => this.toEntry(row, org));
  }

  /** Adds an assignment, or updates the one this principal already has. */
  async add(
    user: AuthenticatedUser,
    actor: ActorContext,
    courseId: string,
    dto: CreateAssignmentDto,
  ) {
    const { course } = await this.access.requireCourse(
      user,
      courseId,
      "MANAGE",
    );
    await this.principals.assertActive(
      user.orgId,
      dto.principalType,
      dto.principalId,
    );
    const principal = principalColumn(dto.principalType, dto.principalId);
    const { before, row } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.courseAssignment.findFirst({
        where: { courseId, ...principal },
      });
      const saved = existing
        ? await tx.courseAssignment.update({
            where: { id: existing.id },
            data: rules(dto),
            include: ENTRY_INCLUDE,
          })
        : await tx.courseAssignment.create({
            data: {
              courseId,
              ...principal,
              ...rules(dto),
              createdById: user.id,
            },
            include: ENTRY_INCLUDE,
          });
      await this.audit(
        tx,
        actor,
        existing ? "CourseAssignment.UPDATE" : "CourseAssignment.CREATE",
        saved,
        existing,
      );
      return { before: existing, row: saved };
    });
    const org = await this.organization(user.orgId);
    if (
      course.status === CourseStatus.PUBLISHED &&
      row.mandatory &&
      !before?.mandatory
    ) {
      await this.notifyReached(course, [row], org.members, org.parentOf);
    }
    return this.toEntry(row, org);
  }

  async update(
    user: AuthenticatedUser,
    actor: ActorContext,
    assignmentId: string,
    dto: AssignmentRulesDto,
  ) {
    const { before, course } = await this.requireAssignment(user, assignmentId);
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.courseAssignment.update({
        where: { id: assignmentId },
        data: rules(dto),
        include: ENTRY_INCLUDE,
      });
      await this.audit(tx, actor, "CourseAssignment.UPDATE", saved, before);
      return saved;
    });
    const org = await this.organization(user.orgId);
    if (
      course.status === CourseStatus.PUBLISHED &&
      row.mandatory &&
      !before.mandatory
    ) {
      await this.notifyReached(course, [row], org.members, org.parentOf);
    }
    return this.toEntry(row, org);
  }

  async remove(
    user: AuthenticatedUser,
    actor: ActorContext,
    assignmentId: string,
  ) {
    const { before } = await this.requireAssignment(user, assignmentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.courseAssignment.delete({ where: { id: assignmentId } });
      await this.audit(tx, actor, "CourseAssignment.DELETE", null, before);
    });
  }

  /** On a course's first publish, everyone its mandatory assignments reach hears about it. */
  async notifyOnFirstPublish(course: {
    id: string;
    title: string;
    organizationId: string;
  }) {
    const rows = await this.prisma.courseAssignment.findMany({
      where: { courseId: course.id, mandatory: true },
    });
    if (rows.length === 0) return;
    const org = await this.organization(course.organizationId);
    await this.notifyReached(course, rows, org.members, org.parentOf);
  }

  private async notifyReached(
    course: { id: string; title: string },
    rows: CourseAssignment[],
    members: Member[],
    parentOf: Map<string, string | null>,
  ) {
    const userIds = [
      ...new Set(rows.flatMap((row) => usersReachedBy(row, members, parentOf))),
    ];
    await bestEffort("notify course assignment", () =>
      this.notifications.notifyMany(userIds, {
        type: "grow:course:assigned",
        // Notification titles hold 200 characters; course titles up to 200.
        title: `You were assigned ${course.title}`.slice(0, 200),
        link: `/grow/courses/${course.id}`,
        payload: { params: { course: course.title } },
      }),
    );
  }

  private async requireAssignment(
    user: AuthenticatedUser,
    assignmentId: string,
  ) {
    const before = await this.prisma.courseAssignment.findFirst({
      where: { id: assignmentId, course: { organizationId: user.orgId } },
    });
    if (!before) throw new NotFoundException("Assignment not found");
    const { course } = await this.access.requireCourse(
      user,
      before.courseId,
      "MANAGE",
    );
    return { before, course };
  }

  /** Active members with their area and position, and the area tree: enough to expand assignments to people. */
  private async organization(orgId: string) {
    const [users, nodes] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          id: true,
          profile: { select: { orgNodeId: true, positionId: true } },
        },
      }),
      this.prisma.orgNode.findMany({
        where: { organizationId: orgId },
        select: { id: true, parentId: true },
      }),
    ]);
    return {
      members: users.map((u) => ({
        userId: u.id,
        orgNodeId: u.profile?.orgNodeId ?? null,
        positionId: u.profile?.positionId ?? null,
      })),
      parentOf: new Map(nodes.map((n) => [n.id, n.parentId])),
    };
  }

  private toEntry(
    row: EntryRow,
    org: { members: Member[]; parentOf: Map<string, string | null> },
  ) {
    const archived = row.user
      ? !row.user.isActive
      : row.orgNode
        ? !row.orgNode.isActive || row.orgNode.archivedAt !== null
        : !row.position?.isActive;
    return {
      id: row.id,
      principal: principalOf(row),
      archived,
      mandatory: row.mandatory,
      dueAt: toDateOnly(row.dueAt),
      dueInDays: row.dueInDays,
      reachedCount: usersReachedBy(row, org.members, org.parentOf).length,
      createdAt: row.createdAt,
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    action: AuditAction,
    after: CourseAssignment | null,
    before: CourseAssignment | null,
  ) {
    const values = (a: CourseAssignment | null) =>
      a && {
        courseId: a.courseId,
        userId: a.userId,
        orgNodeId: a.orgNodeId,
        positionId: a.positionId,
        mandatory: a.mandatory,
        dueAt: toDateOnly(a.dueAt),
        dueInDays: a.dueInDays,
      };
    return audit(tx, {
      action,
      actorId: actor.userId,
      organizationId: actor.orgId,
      entityType: "CourseAssignment",
      entityId: (after ?? before)!.id,
      oldValues: values(before),
      newValues: values(after),
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  }
}

/** The rule fields a request set; omitted fields stay as they are. */
function rules(dto: AssignmentRulesDto) {
  const data: {
    mandatory?: boolean;
    dueAt?: Date | null;
    dueInDays?: number | null;
  } = {};
  if (dto.mandatory !== undefined) data.mandatory = dto.mandatory;
  if (dto.dueAt !== undefined)
    data.dueAt = dto.dueAt === null ? null : new Date(`${dto.dueAt}T00:00:00Z`);
  if (dto.dueInDays !== undefined) data.dueInDays = dto.dueInDays;
  return data;
}

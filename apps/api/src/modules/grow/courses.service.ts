import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { CourseStatus, Prisma, type Course } from "@prisma/client";
import { collectImageKeys } from "@cluster/editor-schema";
import { audit, diff, type AuditAction } from "../../common/audit.helper";
import { bestEffort } from "../../common/best-effort";
import type { ActorContext, AuthenticatedUser } from "../../common/decorators";
import { assertIconFields } from "../../common/icon-fields";
import { PrismaService } from "../../prisma/prisma.service";
import { PartitionService } from "../org/partition.service";
import { StorageService } from "../storage/storage.service";
import { isCourseManager } from "./course-access";
import { AssignmentsService } from "./assignments.service";
import { CourseAccessService } from "./course-access.service";
import { courseForAuthor, courseSettings } from "./course-dto";
import { publishProblems } from "./course-publish";
import { courseFilePrefix, type LessonContent } from "./lesson-content";
import type {
  CreateCourseDto,
  ManageCoursesQuery,
  UpdateCourseDto,
} from "./dto/course.dto";

/** Course lifecycle for course managers: create, list, settings, publish, archive, restore, delete drafts. */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly storage: StorageService,
    private readonly assignments: AssignmentsService,
    private readonly partition: PartitionService,
  ) {}

  async listForManager(user: AuthenticatedUser, query: ManageCoursesQuery) {
    this.requireManager(user);
    const where: Prisma.CourseWhereInput = {
      organizationId: user.orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim()
        ? { title: { contains: query.q.trim(), mode: "insensitive" } }
        : {}),
    };
    const pageSize = query.pageSize ?? 10;
    const { courses, total, page } = await this.prisma.$transaction(
      async (tx) => {
        const total = await tx.course.count({ where });
        const page = Math.min(
          query.page ?? 1,
          Math.max(1, Math.ceil(total / pageSize)),
        );
        const courses = await tx.course.findMany({
          where,
          include: {
            _count: {
              select: { sections: true, steps: true, enrollments: true },
            },
          },
          orderBy: [
            {
              [query.sort ?? "updatedAt"]:
                query.order ?? (query.sort === "title" ? "asc" : "desc"),
            },
            { id: "asc" },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        return { courses, total, page };
      },
    );
    const completed = await this.prisma.enrollment.groupBy({
      by: ["courseId"],
      where: {
        courseId: { in: courses.map((c) => c.id) },
        status: "COMPLETED",
      },
      _count: true,
    });
    const completedOf = new Map(completed.map((g) => [g.courseId, g._count]));
    const pending = await this.prisma.quizAttempt.findMany({
      where: {
        status: "PENDING_REVIEW",
        step: { courseId: { in: courses.map((c) => c.id) } },
      },
      select: { step: { select: { courseId: true } } },
    });
    const pendingOf = (id: string) =>
      pending.filter((a) => a.step.courseId === id).length;
    const creators = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(courses.map((c) => c.createdById))] },
        organizationId: user.orgId,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    const creatorOf = new Map(creators.map((u) => [u.id, u]));
    return {
      total,
      page,
      pageSize,
      items: courses.map((c) => ({
        ...courseSettings(c),
        sectionCount: c._count.sections,
        stepCount: c._count.steps,
        learnerCount: c._count.enrollments,
        completedCount: completedOf.get(c.id) ?? 0,
        pendingReviews: pendingOf(c.id),
        createdBy: creatorOf.get(c.createdById) ?? null,
      })),
    };
  }

  async create(
    user: AuthenticatedUser,
    actor: ActorContext,
    dto: CreateCourseDto,
  ) {
    this.requireManager(user);
    const iconType = dto.iconType ?? "LUCIDE";
    const icon = dto.icon ?? "graduation";
    assertIconFields(iconType, icon, dto.emoji);
    // Under isolation a course is for its own main node unless the manager says otherwise (node-partitions rule 5).
    const restricted = dto.restricted ?? (await this.partition.isolated(user.orgId));
    const course = await this.prisma.$transaction(async (tx) => {
      const created = await tx.course.create({
        data: {
          organizationId: user.orgId,
          title: dto.title,
          restricted,
          description: dto.description?.trim() || null,
          icon,
          iconType,
          emoji: iconType === "EMOJI" ? dto.emoji : null,
          createdById: user.id,
        },
      });
      await this.audit(tx, actor, "Course.CREATE", created.id, null, {
        title: created.title,
      });
      return created;
    });
    return courseSettings(course);
  }

  async getForEdit(user: AuthenticatedUser, courseId: string) {
    await this.access.requireCourse(user, courseId, "MANAGE");
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      include: { sections: { include: { steps: true } } },
    });
    return courseForAuthor(course);
  }

  async update(
    user: AuthenticatedUser,
    actor: ActorContext,
    courseId: string,
    dto: UpdateCourseDto,
  ) {
    const { course } = await this.access.requireCourse(
      user,
      courseId,
      "MANAGE",
    );
    // Validate the merged result so a partial patch cannot contradict the current state.
    assertIconFields(
      dto.iconType ?? course.iconType,
      dto.icon === undefined ? course.icon : dto.icon,
      dto.emoji === undefined ? course.emoji : dto.emoji,
    );
    const data: Prisma.CourseUpdateInput = {};
    for (const key of [
      "title",
      "description",
      "icon",
      "iconType",
      "emoji",
      "restricted",
      "sequential",
      "issuesCertificate",
    ] as const) {
      if (dto[key] !== undefined)
        (data as Record<string, unknown>)[key] = dto[key];
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.course.update({ where: { id: courseId }, data });
      const changes = diff(
        course as unknown as Record<string, unknown>,
        data as Record<string, unknown>,
      );
      await this.audit(
        tx,
        actor,
        "Course.UPDATE",
        courseId,
        changes.oldValues,
        changes.newValues,
      );
      return row;
    });
    return courseSettings(updated);
  }

  async publish(
    user: AuthenticatedUser,
    actor: ActorContext,
    courseId: string,
  ) {
    const { course } = await this.access.requireCourse(
      user,
      courseId,
      "MANAGE",
    );
    const published = await this.transition(
      actor,
      course,
      CourseStatus.DRAFT,
      CourseStatus.PUBLISHED,
      "Course.PUBLISH",
      "Only a draft can be published",
    );
    // Assigned while it was a draft: people hear about it now. Restoring an archived course notifies nobody.
    if (!course.publishedAt)
      await this.assignments.notifyOnFirstPublish(course);
    return published;
  }

  async archive(
    user: AuthenticatedUser,
    actor: ActorContext,
    courseId: string,
  ) {
    const { course } = await this.access.requireCourse(
      user,
      courseId,
      "MANAGE",
    );
    return this.transition(
      actor,
      course,
      CourseStatus.PUBLISHED,
      CourseStatus.ARCHIVED,
      "Course.ARCHIVE",
      "Only a published course can be archived",
    );
  }

  async restore(
    user: AuthenticatedUser,
    actor: ActorContext,
    courseId: string,
  ) {
    const { course } = await this.access.requireCourse(
      user,
      courseId,
      "MANAGE",
    );
    return this.transition(
      actor,
      course,
      CourseStatus.ARCHIVED,
      CourseStatus.PUBLISHED,
      "Course.RESTORE",
      "Only an archived course can be restored",
    );
  }

  /** Only a draft that was never published; its enrollments and certificates would be compliance evidence. */
  async remove(user: AuthenticatedUser, actor: ActorContext, courseId: string) {
    const { course } = await this.access.requireCourse(
      user,
      courseId,
      "MANAGE",
    );
    if (course.publishedAt)
      throw new ConflictException({
        code: "COURSE_PUBLISHED",
        message: "Archive it instead",
      });
    const lessons = await this.prisma.courseStep.findMany({
      where: { courseId, type: "LESSON" },
      select: { content: true },
    });
    const uploads = `organizations/${user.orgId}/uploads/`;
    const images = [
      ...new Set(
        lessons.flatMap((s) => {
          const content = s.content as unknown as LessonContent;
          return content.kind === "text"
            ? [...collectImageKeys(content.doc)]
            : [];
        }),
      ),
    ].filter((key) => key.startsWith(uploads));

    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.course.deleteMany({
        where: { id: courseId, publishedAt: null },
      });
      if (deleted.count === 0)
        throw new ConflictException({
          code: "COURSE_PUBLISHED",
          message: "Archive it instead",
        });
      await this.audit(
        tx,
        actor,
        "Course.DELETE",
        courseId,
        { title: course.title },
        null,
      );
    });

    await bestEffort("delete course files", () =>
      this.storage.deletePrefix(courseFilePrefix(user.orgId, courseId)),
    );
    for (const key of images) {
      // An image pasted into another course's lesson stays.
      const [{ count }] = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS "count" FROM "course_steps" WHERE "content"::text LIKE ${`%"${key}"%`}`;
      if (count === BigInt(0))
        await bestEffort("delete lesson image", () =>
          this.storage.deleteFile(key),
        );
    }
  }

  private async transition(
    actor: ActorContext,
    course: Course,
    from: CourseStatus,
    to: CourseStatus,
    action: AuditAction,
    wrongState: string,
  ) {
    if (course.status !== from)
      throw new ConflictException({
        code: "COURSE_STATE",
        message: wrongState,
      });
    if (to === CourseStatus.PUBLISHED) {
      const sections = await this.prisma.courseSection.findMany({
        where: { courseId: course.id },
        include: { steps: true },
      });
      const problems = publishProblems(sections);
      if (problems.length > 0) {
        throw new BadRequestException({
          code: "COURSE_INVALID",
          message: "The course is not ready to publish",
          problems,
        });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      // The status guard makes a double click or two managers publishing at once change it once.
      const changed = await tx.course.updateMany({
        where: { id: course.id, status: from },
        data: {
          status: to,
          ...(to === CourseStatus.PUBLISHED && !course.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        },
      });
      if (changed.count === 0)
        throw new ConflictException({
          code: "COURSE_STATE",
          message: wrongState,
        });
      await this.audit(
        tx,
        actor,
        action,
        course.id,
        { status: from },
        { status: to },
      );
      return courseSettings(
        await tx.course.findUniqueOrThrow({ where: { id: course.id } }),
      );
    });
  }

  private requireManager(user: AuthenticatedUser) {
    if (!isCourseManager(user))
      throw new ForbiddenException(
        "You do not have permission to manage courses",
      );
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    action: AuditAction,
    entityId: string,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null,
  ) {
    return audit(tx, {
      action,
      actorId: actor.userId,
      organizationId: actor.orgId,
      entityType: "Course",
      entityId,
      oldValues,
      newValues,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  }
}

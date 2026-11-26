import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AttemptStatus,
  CourseStatus,
  EnrollmentStatus,
  Prisma,
} from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { principalWhere, type PrincipalContext } from "../org/principal";
import { PrincipalService } from "../org/principal.service";
import { byUrgency, derivedState, effectiveDue } from "./assignment-resolution";
import { CourseAccessService } from "./course-access.service";
import { courseSettings, quizForLearner } from "./course-dto";
import { certificateDto } from "./certificates.service";
import { CourseProgressService } from "./course-progress.service";
import { todayIn, type DateOnly } from "./due-date";
import type { CatalogQuery } from "./dto/learning.dto";
import type { QuizContent } from "./quiz-content";
import { blockingStep, nextStep, progressOf } from "./step-order";

/** Best score and attempts used on a quiz (D16); whether one waits for review or is under way. */
function quizRecord(
  attempts: {
    id: string;
    status: AttemptStatus;
    score: number | null;
    submittedAt: Date | null;
  }[],
) {
  const scores = attempts.flatMap((a) => (a.score === null ? [] : [a.score]));
  return {
    best: scores.length ? Math.max(...scores) : null,
    attempts: attempts.filter((a) => a.status !== AttemptStatus.IN_PROGRESS)
      .length,
    pendingReview: attempts.some(
      (a) => a.status === AttemptStatus.PENDING_REVIEW,
    ),
    inProgress: attempts.some((a) => a.status === AttemptStatus.IN_PROGRESS),
    // Newest first: the result a learner is sent back to after a review.
    lastAttemptId: attempts.find((a) => a.submittedAt !== null)?.id ?? null,
  };
}

const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const RECOMMENDED = 3;
/** Shortcuts the sidebar lists under Courses. */
const PENDING_SHORTCUTS = 5;

/** Who the learner is for assignments: principals, when they last changed area or position, and today in their organization. */
interface Reach {
  ctx: PrincipalContext;
  assignmentChangedAt: Date | null;
  timeZone: string;
  today: DateOnly;
}

const cardInclude = (userId: string, ctx: PrincipalContext) =>
  ({
    sections: { select: { id: true } },
    steps: {
      select: {
        id: true,
        position: true,
        required: true,
        durationMinutes: true,
      },
    },
    assignments: { where: principalWhere(ctx) },
    enrollments: {
      where: { userId },
      include: { progress: { select: { stepId: true } } },
    },
  }) satisfies Prisma.CourseInclude;

type CardRow = Prisma.CourseGetPayload<{
  include: ReturnType<typeof cardInclude>;
}>;

/** What learners read: My learning, the catalog and a course's overview. Reading never enrols anyone. */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly principals: PrincipalService,
    private readonly progress: CourseProgressService,
  ) {}

  /** Required (mandatory assignments), in progress (voluntary) and a few recommendations. Archived courses never appear. */
  async learning(user: AuthenticatedUser) {
    const reach = await this.reach(user);
    const include = cardInclude(user.id, reach.ctx);
    const learnable = await this.access.learnableWhere(user);
    const required = await this.requiredCards(user, reach);
    const requiredIds = required.map((c) => c.id);
    const [inProgress, recommended] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          AND: [
            learnable,
            { id: { notIn: requiredIds } },
            {
              enrollments: {
                some: { userId: user.id, status: EnrollmentStatus.IN_PROGRESS },
              },
            },
          ],
        },
        include,
      }),
      this.prisma.course.findMany({
        where: {
          AND: [
            learnable,
            { id: { notIn: requiredIds } },
            { enrollments: { none: { userId: user.id } } },
          ],
        },
        include,
        orderBy: { publishedAt: "desc" },
        take: RECOMMENDED,
      }),
    ]);
    return {
      required,
      inProgress: inProgress
        .sort(
          (a, b) =>
            b.enrollments[0].startedAt.getTime() -
            a.enrollments[0].startedAt.getTime(),
        )
        .map((c) => this.card(c, reach)),
      recommended: recommended.map((c) => this.card(c, reach)),
    };
  }

  /** What the sidebar shows: mandatory courses not completed yet, how many are overdue, and the most urgent ones as shortcuts. */
  async pending(user: AuthenticatedUser) {
    const open = (
      await this.requiredCards(user, await this.reach(user))
    ).filter((c) => c.state !== "COMPLETED");
    return {
      pending: open.length,
      overdue: open.filter((c) => c.state === "OVERDUE").length,
      courses: open
        .slice(0, PENDING_SHORTCUTS)
        .map(({ id, title, icon, iconType, emoji, state, dueAt }) => ({
          id,
          title,
          icon,
          iconType,
          emoji,
          state,
          dueAt,
        })),
    };
  }

  /** Mandatory courses assigned to the user, most urgent first. Archived and draft courses never appear. */
  private async requiredCards(user: AuthenticatedUser, reach: Reach) {
    const courses = await this.prisma.course.findMany({
      where: {
        organizationId: user.orgId,
        status: CourseStatus.PUBLISHED,
        assignments: {
          some: { ...principalWhere(reach.ctx), mandatory: true },
        },
      },
      include: cardInclude(user.id, reach.ctx),
    });
    return courses.map((c) => this.card(c, reach)).sort(byUrgency);
  }

  /** Courses the user can learn, by title, filtered by text and by their own state, a page at a time. */
  async catalog(user: AuthenticatedUser, query: CatalogQuery) {
    const reach = await this.reach(user);
    const limit = query.limit ?? 24;
    const mine =
      query.status === "NOT_STARTED"
        ? { enrollments: { none: { userId: user.id } } }
        : query.status
          ? {
              enrollments: {
                some: { userId: user.id, status: query.status },
              },
            }
          : {};
    const rows = await this.prisma.course.findMany({
      where: {
        AND: [
          await this.access.learnableWhere(user),
          query.q
            ? { title: { contains: query.q.trim(), mode: "insensitive" } }
            : {},
          mine,
        ],
      },
      include: cardInclude(user.id, reach.ctx),
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((c) => this.card(c, reach)),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  /**
   * The course page: outline with my progress, never writing. Learners of an archived course still see it
   * (without content); `preview` lets course managers read any course as a learner would.
   */
  async overview(user: AuthenticatedUser, courseId: string, preview: boolean) {
    const { course, canManage } = preview
      ? await this.access.requireCourse(user, courseId, "MANAGE")
      : await this.learnerCourse(user, courseId);
    const reach = await this.reach(user);
    const [assignments, state] = await Promise.all([
      this.prisma.courseAssignment.findMany({
        where: { courseId, ...principalWhere(reach.ctx) },
      }),
      this.progress.state(courseId, user.id),
    ]);
    const { sections, ordered } = state;
    // A preview shows the course as someone who has not started it.
    const enrollment = preview ? null : state.enrollment;
    const done = preview ? new Set<string>() : state.done;
    const certificate =
      enrollment?.status === EnrollmentStatus.COMPLETED
        ? await this.prisma.certificate.findUnique({
            where: { courseId_userId: { courseId, userId: user.id } },
          })
        : null;
    const attempts = enrollment
      ? await this.prisma.quizAttempt.findMany({
          where: { enrollmentId: enrollment.id },
          select: {
            id: true,
            stepId: true,
            status: true,
            score: true,
            submittedAt: true,
          },
          orderBy: { submittedAt: "desc" },
        })
      : [];
    const due = effectiveDue(
      assignments,
      reach.assignmentChangedAt,
      reach.timeZone,
    );
    return {
      ...courseSettings(course),
      canManage,
      preview,
      mandatory: due.mandatory,
      dueAt: due.dueAt,
      isNew: this.isNew(due.since, enrollment),
      certificate: certificate && certificateDto(certificate),
      enrollment: enrollment && {
        status: enrollment.status,
        startedAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
      },
      state: derivedState({
        enrollment: enrollment?.status ?? null,
        dueAt: due.dueAt,
        today: reach.today,
      }),
      progress: progressOf(ordered, done),
      nextStepId: nextStep(ordered, done)?.id ?? null,
      sections: [...sections]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          title: s.title,
          steps: ordered
            .filter((step) => step.sectionId === s.id)
            .map((step) => ({
              id: step.id,
              type: step.type,
              title: step.title,
              required: step.required,
              durationMinutes: step.durationMinutes,
              quiz:
                step.type === "QUIZ"
                  ? {
                      ...quizForLearner(step.content as unknown as QuizContent),
                      ...quizRecord(
                        attempts.filter((a) => a.stepId === step.id),
                      ),
                    }
                  : null,
              completed: done.has(step.id),
              locked:
                blockingStep(ordered, done, step.id, course.sequential) !==
                null,
            })),
        })),
    };
  }

  /** A course the user can learn, or an archived one they were enrolled in (overview only). */
  private async learnerCourse(user: AuthenticatedUser, courseId: string) {
    try {
      return await this.access.requireCourse(user, courseId, "LEARN");
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      const archived = await this.prisma.course.findFirst({
        where: {
          id: courseId,
          organizationId: user.orgId,
          status: CourseStatus.ARCHIVED,
          enrollments: { some: { userId: user.id } },
        },
      });
      if (!archived) throw err;
      return { course: archived, canLearn: false, canManage: false };
    }
  }

  private async reach(user: AuthenticatedUser): Promise<Reach> {
    const [ctx, profile, org] = await Promise.all([
      this.principals.contextFor(user.id, user.orgId),
      this.prisma.userProfile.findUnique({
        where: { userId: user.id },
        select: { assignmentChangedAt: true },
      }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: user.orgId },
        select: { timezone: true },
      }),
    ]);
    return {
      ctx,
      assignmentChangedAt: profile?.assignmentChangedAt ?? null,
      timeZone: org.timezone,
      today: todayIn(org.timezone),
    };
  }

  /** A course in a list, with what it means for this learner. */
  private card(course: CardRow, reach: Reach) {
    const enrollment = course.enrollments[0] ?? null;
    const done = new Set(enrollment?.progress.map((p) => p.stepId));
    const due = effectiveDue(
      course.assignments,
      reach.assignmentChangedAt,
      reach.timeZone,
    );
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      icon: course.icon,
      iconType: course.iconType,
      emoji: course.emoji,
      restricted: course.restricted,
      sectionCount: course.sections.length,
      stepCount: course.steps.length,
      durationMinutes: course.steps.reduce(
        (sum, s) => sum + (s.durationMinutes ?? 0),
        0,
      ),
      mandatory: due.mandatory,
      dueAt: due.dueAt,
      isNew: this.isNew(due.since, enrollment),
      state: derivedState({
        enrollment: enrollment?.status ?? null,
        dueAt: due.dueAt,
        today: reach.today,
      }),
      progress: progressOf(course.steps, done),
      completedAt: enrollment?.completedAt ?? null,
    };
  }

  /** Became required in the last 7 days and not started yet. */
  private isNew(since: Date | null, enrollment: unknown) {
    return (
      since !== null && !enrollment && Date.now() - since.getTime() < NEW_FOR_MS
    );
  }
}

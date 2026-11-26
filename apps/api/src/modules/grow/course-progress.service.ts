import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EnrollmentStatus,
  Prisma,
  StepType,
  type CourseStep,
} from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { CertificatesService } from "./certificates.service";
import { CourseAccessService } from "./course-access.service";
import { stepForLearner } from "./course-dto";
import { blockingStep, orderSteps, progressOf } from "./step-order";

type Db = Prisma.TransactionClient | PrismaService;

/**
 * A learner's run through a course: enrolment, opening steps and completing them, and completing
 * enrolments when an outline edit leaves nothing required pending. Completion is never undone.
 */
@Injectable()
export class CourseProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly certificates: CertificatesService,
  ) {}

  /** The ordered outline of a course and one learner's enrolment with the steps they have done. */
  async state(courseId: string, userId: string) {
    const [sections, enrollment] = await Promise.all([
      this.prisma.courseSection.findMany({
        where: { courseId },
        include: { steps: true },
      }),
      this.prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId, userId } },
        include: { progress: { select: { stepId: true } } },
      }),
    ]);
    const ordered = orderSteps(sections);
    const done = new Set(enrollment?.progress.map((p) => p.stepId));
    return { sections, ordered, enrollment, done };
  }

  async enroll(user: AuthenticatedUser, courseId: string) {
    await this.access.requireCourse(user, courseId, "LEARN");
    const { status, startedAt, completedAt } = await this.ensureEnrollment(
      courseId,
      user.id,
    );
    return { status, startedAt, completedAt };
  }

  /** A step's content for the learner; opening it enrols them. A preview (course managers) writes nothing and is never locked. */
  async openStep(
    user: AuthenticatedUser,
    courseId: string,
    stepId: string,
    preview: boolean,
  ) {
    const { course } = await this.access.requireCourse(
      user,
      courseId,
      preview ? "MANAGE" : "LEARN",
    );
    const { ordered, done } = await this.state(courseId, user.id);
    const step = this.findStep(ordered, stepId);
    if (!preview) {
      this.assertUnlocked(ordered, done, stepId, course.sequential);
      await this.ensureEnrollment(courseId, user.id);
    }
    return { step: stepForLearner(step), completed: done.has(stepId) };
  }

  /** A step of a course the user can learn, open to them (not locked by the sequential order). */
  async requireOpenStep(
    user: AuthenticatedUser,
    courseId: string,
    stepId: string,
  ) {
    const { course } = await this.access.requireCourse(user, courseId, "LEARN");
    const { ordered, done } = await this.state(courseId, user.id);
    const step = this.findStep(ordered, stepId);
    this.assertUnlocked(ordered, done, stepId, course.sequential);
    return { course, step, done };
  }

  /** Marks a lesson done (idempotent) and completes the enrolment once every required step is. */
  async complete(user: AuthenticatedUser, courseId: string, stepId: string) {
    const { step } = await this.requireOpenStep(user, courseId, stepId);
    if (step.type === StepType.QUIZ)
      throw new BadRequestException({
        code: "STEP_IS_QUIZ",
        message: "A quiz is completed by passing it",
      });

    const enrollment = await this.ensureEnrollment(courseId, user.id);
    await this.completeStep(this.prisma, enrollment.id, courseId, stepId);

    const after = await this.state(courseId, user.id);
    return {
      completed: true,
      enrollment: {
        status: after.enrollment!.status,
        completedAt: after.enrollment!.completedAt,
      },
      progress: progressOf(after.ordered, after.done),
    };
  }

  /** Records a step as done (idempotent) and completes the enrolment once every required step is. */
  async completeStep(
    db: Db,
    enrollmentId: string,
    courseId: string,
    stepId: string,
  ) {
    await db.stepProgress.createMany({
      data: [{ enrollmentId, stepId }],
      skipDuplicates: true,
    });
    await this.completeIfDone(db, courseId, enrollmentId);
  }

  /** After a step is deleted or made optional: in-progress enrolments with every required step done become completed. */
  reconcile(db: Db, courseId: string) {
    return this.completeIfDone(db, courseId);
  }

  private async completeIfDone(
    db: Db,
    courseId: string,
    enrollmentId?: string,
  ) {
    const required = (
      await db.courseStep.findMany({
        where: { courseId, required: true },
        select: { id: true },
      })
    ).map((s) => s.id);
    const open = await db.enrollment.findMany({
      where: {
        courseId,
        status: EnrollmentStatus.IN_PROGRESS,
        ...(enrollmentId && { id: enrollmentId }),
      },
      select: {
        id: true,
        userId: true,
        progress: {
          where: { stepId: { in: required } },
          select: { stepId: true },
        },
      },
    });
    for (const e of open.filter((e) => e.progress.length === required.length)) {
      // The status guard makes parallel calls complete an enrolment, and issue its certificate, once.
      const { count } = await db.enrollment.updateMany({
        where: { id: e.id, status: EnrollmentStatus.IN_PROGRESS },
        data: { status: EnrollmentStatus.COMPLETED, completedAt: new Date() },
      });
      if (count === 1) await this.certificates.issue(db, courseId, e.userId);
    }
  }

  /** Created if missing; parallel calls create one. */
  async ensureEnrollment(courseId: string, userId: string) {
    await this.prisma.enrollment.createMany({
      data: [{ courseId, userId }],
      skipDuplicates: true,
    });
    return this.prisma.enrollment.findUniqueOrThrow({
      where: { courseId_userId: { courseId, userId } },
    });
  }

  private findStep(ordered: CourseStep[], stepId: string) {
    const step = ordered.find((s) => s.id === stepId);
    if (!step) throw new NotFoundException("Step not found");
    return step;
  }

  private assertUnlocked(
    ordered: CourseStep[],
    done: Set<string>,
    stepId: string,
    sequential: boolean,
  ) {
    const blocker = blockingStep(ordered, done, stepId, sequential);
    if (blocker)
      throw new ConflictException({
        code: "STEP_LOCKED",
        message: `Complete "${blocker.title}" first`,
        stepId: blocker.id,
        params: { title: blocker.title },
      });
  }
}

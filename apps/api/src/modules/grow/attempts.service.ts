import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AttemptStatus,
  Capability,
  Prisma,
  StepType,
  UserRole,
  type QuizAttempt,
} from "@prisma/client";
import { bestEffort } from "../../common/best-effort";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { attemptForLearner } from "./attempt-dto";
import { CourseAccessService } from "./course-access.service";
import { CourseProgressService } from "./course-progress.service";
import { draw, secureRandom } from "./draw";
import { autoGrade, finalScore, parseAnswers } from "./grade";
import type { Question, QuizContent } from "./quiz-content";

/** A learner's tries at a quiz: start or resume, read, submit. Only the owner reaches an attempt (404 otherwise). */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly progress: CourseProgressService,
    private readonly notifications: NotificationService,
  ) {}

  /** Returns the attempt in progress, or draws a new one; refused while one waits for review. */
  async start(user: AuthenticatedUser, courseId: string, stepId: string) {
    const { step } = await this.progress.requireOpenStep(
      user,
      courseId,
      stepId,
    );
    if (step.type !== StepType.QUIZ)
      throw new BadRequestException({
        code: "STEP_NOT_QUIZ",
        message: "This step is not a quiz",
      });
    const quiz = step.content as unknown as QuizContent;
    if (quiz.questions.length === 0)
      throw new ConflictException({
        code: "QUIZ_EMPTY",
        message: "This quiz has no questions yet",
      });
    const enrollment = await this.progress.ensureEnrollment(courseId, user.id);

    const attempt = await this.prisma.$transaction(async (tx) => {
      // One learner's starts queue on their enrolment row, so parallel calls create one attempt.
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollment.id} FOR UPDATE`;
      const open = await tx.quizAttempt.findFirst({
        where: {
          enrollmentId: enrollment.id,
          stepId,
          status: {
            in: [AttemptStatus.IN_PROGRESS, AttemptStatus.PENDING_REVIEW],
          },
        },
      });
      if (open?.status === AttemptStatus.PENDING_REVIEW)
        throw new ConflictException({
          code: "ATTEMPT_PENDING_REVIEW",
          message: "Your last attempt is waiting for review",
        });
      return (
        open ??
        tx.quizAttempt.create({
          data: {
            enrollmentId: enrollment.id,
            stepId,
            passScore: quiz.passScore,
            questions: draw(
              quiz,
              secureRandom,
            ) as unknown as Prisma.InputJsonValue,
          },
        })
      );
    });
    return attemptForLearner(attempt, { revealAnswers: false });
  }

  async get(user: AuthenticatedUser, attemptId: string) {
    const attempt = await this.requireOwn(user, attemptId);
    return this.shown(attempt);
  }

  /**
   * Grades the choice questions; written answers send the attempt to review. Parallel submits finish
   * it once (the others get the stored result). A pass completes the step.
   */
  async submit(user: AuthenticatedUser, attemptId: string, input: unknown) {
    const attempt = await this.requireOwn(user, attemptId);
    const { course } = await this.access.requireCourse(
      user,
      attempt.step.courseId,
      "LEARN",
    );
    const snapshot = attempt.questions as unknown as Question[];
    const answers = parseAnswers(snapshot, input);
    const { perQuestion, openPending } = autoGrade(snapshot, answers);
    const result = openPending
      ? null
      : finalScore(snapshot, perQuestion, {}, attempt.passScore);

    const now = new Date();
    const { count } = await this.prisma.quizAttempt.updateMany({
      where: { id: attempt.id, status: AttemptStatus.IN_PROGRESS },
      data: {
        answers: answers as Prisma.InputJsonValue,
        submittedAt: now,
        ...(result
          ? {
              status: AttemptStatus.GRADED,
              score: result.percent,
              passed: result.passed,
              gradedAt: now,
            }
          : { status: AttemptStatus.PENDING_REVIEW }),
      },
    });
    if (count === 1 && result?.passed)
      await this.progress.completeStep(
        this.prisma,
        attempt.enrollmentId,
        course.id,
        attempt.stepId,
      );
    if (count === 1 && !result)
      await bestEffort("notify quiz review", () =>
        this.notifyReviewers(user, course, attempt.step.title),
      );
    return this.shown(await this.requireOwn(user, attemptId));
  }

  /** The learner's view; the right options once they passed the step and the quiz shows them. */
  private async shown(attempt: QuizAttempt & { step: { content: unknown } }) {
    const quiz = attempt.step.content as QuizContent;
    const passed =
      quiz.showCorrectAnswers &&
      (await this.prisma.stepProgress.count({
        where: { enrollmentId: attempt.enrollmentId, stepId: attempt.stepId },
      })) > 0;
    return attemptForLearner(attempt, { revealAnswers: passed });
  }

  private async requireOwn(user: AuthenticatedUser, attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        enrollment: {
          userId: user.id,
          course: { organizationId: user.orgId },
        },
      },
      include: {
        step: { select: { courseId: true, title: true, content: true } },
      },
    });
    if (!attempt) throw new NotFoundException("Attempt not found");
    return attempt;
  }

  /** Everyone who can grade it: ADMINs and holders of GROW_COURSE_MANAGE. */
  private async notifyReviewers(
    learner: AuthenticatedUser,
    course: { id: string; title: string },
    stepTitle: string,
  ) {
    const [reviewers, me] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId: learner.orgId,
          isActive: true,
          OR: [
            { role: UserRole.ADMIN },
            {
              capabilities: {
                some: { capability: Capability.GROW_COURSE_MANAGE },
              },
            },
          ],
        },
        select: { id: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: learner.id },
        select: { firstName: true, lastName: true },
      }),
    ]);
    await this.notifications.notifyMany(
      reviewers.map((r) => r.id).filter((id) => id !== learner.id),
      {
        type: "grow:quiz:review",
        // Notification titles hold 200 characters.
        title:
          `${me.firstName} ${me.lastName} submitted ${stepTitle} for review`.slice(
            0,
            200,
          ),
        body: course.title.slice(0, 500),
        link: `/grow/courses/${course.id}/reviews`,
        payload: {
          params: { name: `${me.firstName} ${me.lastName}`, step: stepTitle },
        },
      },
    );
  }
}

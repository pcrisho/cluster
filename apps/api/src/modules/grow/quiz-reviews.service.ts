import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AttemptStatus, Prisma } from "@prisma/client";
import { audit } from "../../common/audit.helper";
import { bestEffort } from "../../common/best-effort";
import type { ActorContext, AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationService } from "../notification/notification.service";
import { attemptForReviewer } from "./attempt-dto";
import { CourseAccessService } from "./course-access.service";
import { CourseProgressService } from "./course-progress.service";
import { autoGrade, finalScore, type Answers } from "./grade";
import type { Question } from "./quiz-content";

/** Written answers waiting for a course manager, and grading them. */
@Injectable()
export class QuizReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
    private readonly progress: CourseProgressService,
    private readonly notifications: NotificationService,
  ) {}

  /** A course's attempts waiting for review, oldest first, with the learner, the answers and the grader guidance. */
  async pending(user: AuthenticatedUser, courseId: string) {
    await this.access.requireCourse(user, courseId, "MANAGE");
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { status: AttemptStatus.PENDING_REVIEW, step: { courseId } },
      include: {
        step: { select: { title: true } },
        enrollment: {
          select: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { submittedAt: "asc" },
    });
    return attempts.map((a) => ({
      ...attemptForReviewer(a),
      stepTitle: a.step.title,
      learner: a.enrollment.user,
    }));
  }

  /** Points for every written answer (0 to the question's points); then the score, the step if passed, and the learner is told. */
  async grade(
    user: AuthenticatedUser,
    actor: ActorContext,
    attemptId: string,
    scores: Record<string, unknown>,
  ) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        step: { course: { organizationId: user.orgId } },
      },
      include: {
        step: { select: { courseId: true, title: true } },
        enrollment: { select: { userId: true } },
      },
    });
    if (!attempt) throw new NotFoundException("Attempt not found");
    await this.access.requireCourse(user, attempt.step.courseId, "MANAGE");
    if (attempt.status !== AttemptStatus.PENDING_REVIEW)
      throw new ConflictException({
        code: "ATTEMPT_NOT_PENDING",
        message: "This attempt is not waiting for review",
      });

    const snapshot = attempt.questions as unknown as Question[];
    const { perQuestion } = autoGrade(
      snapshot,
      (attempt.answers ?? {}) as Answers,
    );
    const openScores = parseScores(snapshot, perQuestion, scores);
    const result = finalScore(
      snapshot,
      perQuestion,
      openScores,
      attempt.passScore,
    );

    const graded = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.quizAttempt.updateMany({
        where: { id: attempt.id, status: AttemptStatus.PENDING_REVIEW },
        data: {
          status: AttemptStatus.GRADED,
          openScores: openScores as Prisma.InputJsonValue,
          score: result.percent,
          passed: result.passed,
          gradedAt: now,
          gradedById: user.id,
        },
      });
      if (count === 0)
        throw new ConflictException({
          code: "ATTEMPT_NOT_PENDING",
          message: "This attempt is not waiting for review",
        });
      await audit(tx, {
        action: "QuizAttempt.GRADE",
        actorId: actor.userId,
        organizationId: actor.orgId,
        entityType: "QuizAttempt",
        entityId: attempt.id,
        newValues: { openScores, score: result.percent, passed: result.passed },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
      if (result.passed)
        await this.progress.completeStep(
          tx,
          attempt.enrollmentId,
          attempt.step.courseId,
          attempt.stepId,
        );
      return tx.quizAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    });

    await bestEffort("notify quiz graded", () =>
      this.notifications.notify(attempt.enrollment.userId, {
        type: "grow:quiz:graded",
        title: `Your answers in ${attempt.step.title} were reviewed`.slice(
          0,
          200,
        ),
        link: `/grow/courses/${attempt.step.courseId}/learn/${attempt.stepId}`,
        payload: { params: { step: attempt.step.title } },
      }),
    );
    return attemptForReviewer(graded);
  }
}

/** Exactly the written answers still pending, each a whole number from 0 to its question's points. */
function parseScores(
  snapshot: Question[],
  perQuestion: ReturnType<typeof autoGrade>["perQuestion"],
  scores: Record<string, unknown>,
): Record<string, number> {
  const pending = snapshot.filter(
    (q) => q.type === "open" && perQuestion[q.id].earned === null,
  );
  const keys = Object.keys(scores);
  if (
    keys.length !== pending.length ||
    keys.some((k) => !pending.some((q) => q.id === k))
  )
    throw new BadRequestException({
      code: "GRADES_INCOMPLETE",
      message: "Score every written answer, and only those",
    });
  const out: Record<string, number> = {};
  for (const q of pending) {
    const points = scores[q.id];
    if (
      !Number.isInteger(points) ||
      (points as number) < 0 ||
      (points as number) > q.points
    )
      throw new BadRequestException(
        `Points for "${q.prompt.slice(0, 60)}" go from 0 to ${q.points}`,
      );
    out[q.id] = points as number;
  }
  return out;
}

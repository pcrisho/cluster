import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { principalWhere } from "../org/principal";
import { PrincipalService } from "../org/principal.service";
import {
  courseAccess,
  decide,
  isCourseManager,
  visibleCourseWhere,
  type CourseNeed,
} from "./course-access";

/** The one place that decides who can learn or manage which course. Invisible courses look missing (404). */
@Injectable()
export class CourseAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly principals: PrincipalService,
  ) {}

  /** A course of the user's organization they may use this way, with what else they may do with it. */
  async requireCourse(
    user: AuthenticatedUser,
    courseId: string,
    need: CourseNeed,
  ) {
    const found = await this.accessFor(user, courseId);
    if (!found) throw new NotFoundException("Course not found");
    const { course, access } = found;
    const decision = decide(access, need);
    if (decision === "NOT_FOUND")
      throw new NotFoundException("Course not found");
    if (decision === "FORBIDDEN")
      throw new ForbiddenException(
        "You do not have permission to perform this action",
      );
    return { course, canLearn: access.learn, canManage: access.manage };
  }

  /** Whether the user may see the course at all (learn or manage): the rule for its stored files. */
  async canRead(user: AuthenticatedUser, courseId: string): Promise<boolean> {
    const found = await this.accessFor(user, courseId);
    return !!found && (found.access.learn || found.access.manage);
  }

  private async accessFor(user: AuthenticatedUser, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, organizationId: user.orgId },
    });
    if (!course) return null;
    // Only a restricted, published course needs to know who it is assigned to.
    const assigned =
      course.restricted &&
      course.status === "PUBLISHED" &&
      (await this.isAssigned(user, course.id));
    const access = courseAccess({
      manager: isCourseManager(user),
      status: course.status,
      restricted: course.restricted,
      assigned,
    });
    return { course, access };
  }

  /** Filter for course lists. */
  async visibleWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.CourseWhereInput> {
    const manager = isCourseManager(user);
    const ctx = manager
      ? { userId: user.id, orgNodeIds: [], positionId: null }
      : await this.principals.contextFor(user.id, user.orgId);
    return visibleCourseWhere(user.orgId, manager, ctx);
  }

  /** Filter for the courses a user can learn (catalog, My learning): the learner rule, for managers too. */
  async learnableWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.CourseWhereInput> {
    const ctx = await this.principals.contextFor(user.id, user.orgId);
    return visibleCourseWhere(user.orgId, false, ctx);
  }

  private async isAssigned(
    user: AuthenticatedUser,
    courseId: string,
  ): Promise<boolean> {
    const ctx = await this.principals.contextFor(user.id, user.orgId);
    return (
      (await this.prisma.courseAssignment.count({
        where: { courseId, ...principalWhere(ctx) },
      })) > 0
    );
  }
}

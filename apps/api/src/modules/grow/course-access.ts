import { Capability, CourseStatus, Prisma, UserRole } from "@prisma/client";
import { principalWhere, type PrincipalContext } from "../org/principal";

export type CourseNeed = "LEARN" | "MANAGE";
export type Decision = "OK" | "FORBIDDEN" | "NOT_FOUND";

/** Course managers can author, assign, review and archive any course of the organization. */
export function isCourseManager(user: {
  role: UserRole | string;
  capabilities: (Capability | string)[];
}): boolean {
  return (
    user.role === UserRole.ADMIN ||
    user.capabilities.includes(Capability.GROW_COURSE_MANAGE)
  );
}

/** What one user may do with one course of their organization. */
export function courseAccess(input: {
  manager: boolean;
  status: CourseStatus;
  restricted: boolean;
  /** Reached by an assignment (user, area with its ancestors, or position). */
  assigned: boolean;
}) {
  const learn =
    input.status === CourseStatus.PUBLISHED &&
    (!input.restricted || input.assigned);
  return { learn, manage: input.manager, visible: learn || input.manager };
}

/** Invisible courses look missing (404); visible ones the user cannot use this way answer 403. */
export function decide(
  access: ReturnType<typeof courseAccess>,
  need: CourseNeed,
): Decision {
  if (need === "MANAGE")
    return access.manage ? "OK" : access.learn ? "FORBIDDEN" : "NOT_FOUND";
  return access.learn ? "OK" : "NOT_FOUND";
}

/** Courses a user sees in lists: managers see every course; learners the published ones open to them or assigned. */
export function visibleCourseWhere(
  orgId: string,
  manager: boolean,
  ctx: PrincipalContext,
): Prisma.CourseWhereInput {
  if (manager) return { organizationId: orgId };
  return {
    organizationId: orgId,
    status: CourseStatus.PUBLISHED,
    OR: [{ restricted: false }, { assignments: { some: principalWhere(ctx) } }],
  };
}

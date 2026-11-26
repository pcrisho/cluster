import { nodeAndAncestors } from "../org/principal";
import { anchorOf, dueFor, type DateOnly, type DueRule } from "./due-date";

export interface AssignmentTarget extends DueRule {
  mandatory: boolean;
  orgNodeId: string | null;
  positionId: string | null;
}

export interface Member {
  userId: string;
  orgNodeId: string | null;
  positionId: string | null;
}

/** True when the assignment reaches the member: by person, by their area or any area above it, or by position. */
export function reaches(
  target: AssignmentTarget,
  member: Member,
  parentOf: Map<string, string | null>,
): boolean {
  if (target.userId) return target.userId === member.userId;
  if (target.orgNodeId)
    return nodeAndAncestors(member.orgNodeId, parentOf).includes(
      target.orgNodeId,
    );
  return target.positionId !== null && target.positionId === member.positionId;
}

/** The active members an assignment reaches; an area reaches its sub-areas. */
export function usersReachedBy(
  target: AssignmentTarget,
  members: Member[],
  parentOf: Map<string, string | null>,
): string[] {
  return members
    .filter((m) => reaches(target, m, parentOf))
    .map((m) => m.userId);
}

/**
 * What a course's assignments mean for one person: required if any reaching assignment is mandatory;
 * the due date is the earliest effective one among those; `since` (when it became required) feeds the New label.
 */
export function effectiveDue(
  matching: AssignmentTarget[],
  assignmentChangedAt: Date | null,
  timeZone: string,
): { mandatory: boolean; dueAt: DateOnly | null; since: Date | null } {
  const mandatory = matching.filter((a) => a.mandatory);
  if (mandatory.length === 0)
    return { mandatory: false, dueAt: null, since: null };
  const dues = mandatory
    .map((a) => dueFor(a, assignmentChangedAt, timeZone))
    .filter((d): d is DateOnly => d !== null);
  const anchors = mandatory.map((a) =>
    anchorOf(a, assignmentChangedAt).getTime(),
  );
  return {
    mandatory: true,
    dueAt: dues.length > 0 ? dues.sort()[0] : null,
    since: new Date(Math.min(...anchors)),
  };
}

export type DerivedState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OVERDUE";

/** A person's state in a course; OVERDUE means not completed and due before today. */
export function derivedState(input: {
  enrollment: "IN_PROGRESS" | "COMPLETED" | null;
  dueAt: DateOnly | null;
  today: DateOnly;
}): DerivedState {
  if (input.enrollment === "COMPLETED") return "COMPLETED";
  if (input.dueAt !== null && input.dueAt < input.today) return "OVERDUE";
  return input.enrollment === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED";
}

/** "Required" order: overdue, then due soonest, then in progress, not started and completed; ties by due date, then title. */
export function byUrgency(
  a: { state: DerivedState; dueAt: DateOnly | null; title: string },
  b: { state: DerivedState; dueAt: DateOnly | null; title: string },
): number {
  const rank = (i: typeof a) =>
    i.state === "COMPLETED"
      ? 4
      : i.state === "OVERDUE"
        ? 0
        : i.dueAt
          ? 1
          : i.state === "IN_PROGRESS"
            ? 2
            : 3;
  return (
    rank(a) - rank(b) ||
    (a.dueAt ?? "").localeCompare(b.dueAt ?? "") ||
    a.title.localeCompare(b.title)
  );
}

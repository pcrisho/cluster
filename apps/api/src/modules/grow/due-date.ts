/** Due dates are calendar dates ("YYYY-MM-DD"), compared as strings, in the organization's timezone. */
export type DateOnly = string;

/** The calendar date of an instant in a timezone. */
export function dateIn(instant: Date, timeZone: string): DateOnly {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Today in a timezone; `now` is injectable for tests. */
export function todayIn(timeZone: string, now: Date = new Date()): DateOnly {
  return dateIn(now, timeZone);
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A @db.Date column comes back as midnight UTC. */
export function toDateOnly(date: Date | null): DateOnly | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export interface DueRule {
  dueAt: Date | null;
  dueInDays: number | null;
  createdAt: Date;
  /** Set when the assignment points at one person: their anchor is the assignment's creation. */
  userId: string | null;
}

/**
 * When the relative count starts for one person: the assignment's creation, or the moment they
 * entered the assigned area or position if that is later (never for a person assignment).
 */
export function anchorOf(
  rule: DueRule,
  assignmentChangedAt: Date | null,
): Date {
  if (
    rule.userId ||
    !assignmentChangedAt ||
    assignmentChangedAt <= rule.createdAt
  )
    return rule.createdAt;
  return assignmentChangedAt;
}

/** The effective due date for one person: the later of the absolute date and anchor + N days; null if neither is set. */
export function dueFor(
  rule: DueRule,
  assignmentChangedAt: Date | null,
  timeZone: string,
): DateOnly | null {
  const absolute = toDateOnly(rule.dueAt);
  const relative =
    rule.dueInDays === null
      ? null
      : addDays(
          dateIn(anchorOf(rule, assignmentChangedAt), timeZone),
          rule.dueInDays,
        );
  if (absolute && relative) return absolute > relative ? absolute : relative;
  return absolute ?? relative;
}

import type { DerivedState } from "./assignment-resolution";
import { addDays, dateIn, type DateOnly } from "./due-date";

/** What the dashboard needs of a report row (`ReportsService`). */
export interface DashboardRow {
  userId: string;
  name: string;
  area: { id: string; name: string } | null;
  courseId: string;
  courseTitle: string;
  state: DerivedState;
  dueAt: DateOnly | null;
  completedAt: Date | null;
  bestScore: number | null;
}

const STATES: DerivedState[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
];
export const DASHBOARD_COURSES = 8;
export const DASHBOARD_AREAS = 10;
export const DASHBOARD_WEEKS = 12;
export const DASHBOARD_ATTENTION = 5;

const countStates = (rows: DashboardRow[]) =>
  Object.fromEntries(
    STATES.map((s) => [s, rows.filter((r) => r.state === s).length]),
  ) as Record<DerivedState, number>;

const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : null;

/** The Monday of the week a date falls in. */
export function weekStart(date: DateOnly): DateOnly {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/**
 * The compliance dashboard, computed from the same rows as the report (so the same scope and
 * filters): headline figures, status by course, completion by area (worst first), completions per
 * week for the last weeks, and the most overdue assignments.
 */
export function dashboardOf(
  rows: DashboardRow[],
  today: DateOnly,
  timeZone: string,
) {
  const summary = countStates(rows);
  const scores = rows.flatMap((r) =>
    r.bestScore === null ? [] : [r.bestScore],
  );
  const soon = addDays(today, 7);

  const byCourse = new Map<string, DashboardRow[]>();
  const byArea = new Map<string, DashboardRow[]>();
  for (const r of rows) {
    byCourse.set(r.courseId, [...(byCourse.get(r.courseId) ?? []), r]);
    const area = r.area?.id ?? "";
    byArea.set(area, [...(byArea.get(area) ?? []), r]);
  }

  const courses = [...byCourse.values()]
    .map((list) => ({
      id: list[0].courseId,
      title: list[0].courseTitle,
      total: list.length,
      ...countStates(list),
    }))
    .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));

  const areas = [...byArea.entries()]
    .map(([id, list]) => {
      const completed = list.filter((r) => r.state === "COMPLETED").length;
      return {
        id: id || null,
        name: list[0].area?.name ?? "No area",
        total: list.length,
        completed,
        rate: percent(completed, list.length) ?? 0,
      };
    })
    .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));

  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: DASHBOARD_WEEKS }, (_, i) =>
    addDays(thisWeek, -7 * (DASHBOARD_WEEKS - 1 - i)),
  );
  const completedPerWeek = new Map<DateOnly, number>();
  for (const r of rows)
    if (r.completedAt) {
      const week = weekStart(dateIn(r.completedAt, timeZone));
      completedPerWeek.set(week, (completedPerWeek.get(week) ?? 0) + 1);
    }

  return {
    total: rows.length,
    summary,
    completionRate: percent(summary.COMPLETED, rows.length),
    dueSoon: rows.filter(
      (r) =>
        r.state !== "COMPLETED" &&
        r.state !== "OVERDUE" &&
        r.dueAt !== null &&
        r.dueAt <= soon,
    ).length,
    averageScore: scores.length
      ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length)
      : null,
    courses: courses.slice(0, DASHBOARD_COURSES),
    courseCount: courses.length,
    areas: areas.slice(0, DASHBOARD_AREAS),
    areaCount: areas.length,
    weekly: weeks.map((week) => ({
      week,
      completed: completedPerWeek.get(week) ?? 0,
    })),
    attention: rows
      .filter((r) => r.state === "OVERDUE")
      .sort(
        (a, b) =>
          (a.dueAt ?? "").localeCompare(b.dueAt ?? "") ||
          a.name.localeCompare(b.name),
      )
      .slice(0, DASHBOARD_ATTENTION)
      .map((r) => ({
        userId: r.userId,
        name: r.name,
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        dueAt: r.dueAt,
      })),
  };
}

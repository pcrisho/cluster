import { dashboardOf, weekStart, type DashboardRow } from "./report-dashboard";

const row = (over: Partial<DashboardRow>): DashboardRow => ({
  userId: "u",
  name: "Ana",
  area: { id: "a1", name: "Plant" },
  courseId: "c1",
  courseTitle: "Fire",
  state: "NOT_STARTED",
  dueAt: null,
  completedAt: null,
  bestScore: null,
  ...over,
});

describe("dashboardOf", () => {
  const today = "2026-10-29"; // a Thursday

  it("counts states, the completion rate, what is due within 7 days and the mean best score", () => {
    const d = dashboardOf(
      [
        row({ state: "COMPLETED", bestScore: 80 }),
        row({ state: "COMPLETED", bestScore: 91 }),
        row({ state: "IN_PROGRESS", dueAt: "2026-11-05" }),
        row({ state: "NOT_STARTED", dueAt: "2026-11-06" }),
        row({ state: "OVERDUE", dueAt: "2026-10-20" }),
      ],
      today,
      "UTC",
    );
    expect(d.total).toBe(5);
    expect(d.summary).toEqual({
      NOT_STARTED: 1,
      IN_PROGRESS: 1,
      COMPLETED: 2,
      OVERDUE: 1,
    });
    expect(d.completionRate).toBe(40);
    expect(d.dueSoon).toBe(1);
    expect(d.averageScore).toBe(86);
  });

  it("has no rate or score without rows", () => {
    const d = dashboardOf([], today, "UTC");
    expect(d.completionRate).toBeNull();
    expect(d.averageScore).toBeNull();
    expect(d.weekly).toHaveLength(12);
  });

  it("splits courses by state, biggest first, and areas by completion, worst first", () => {
    const d = dashboardOf(
      [
        row({ courseId: "c1", state: "COMPLETED" }),
        row({ courseId: "c2", courseTitle: "Hazards", state: "OVERDUE" }),
        row({ courseId: "c2", courseTitle: "Hazards", area: null }),
      ],
      today,
      "UTC",
    );
    expect(d.courses.map((c) => [c.title, c.total, c.OVERDUE])).toEqual([
      ["Hazards", 2, 1],
      ["Fire", 1, 0],
    ]);
    expect(d.areas.map((a) => [a.name, a.rate])).toEqual([
      ["No area", 0],
      ["Plant", 50],
    ]);
    expect(d.areas[0].id).toBeNull();
  });

  it("counts completions per week, in the organization's timezone, for the last 12 weeks", () => {
    const d = dashboardOf(
      [
        // 04:00 UTC on Monday 26 Oct is 23:00 on Sunday 25 Oct in Lima: the week before.
        row({
          state: "COMPLETED",
          completedAt: new Date("2026-10-26T04:00:00Z"),
        }),
        row({
          state: "COMPLETED",
          completedAt: new Date("2026-10-27T15:00:00Z"),
        }),
        row({
          state: "COMPLETED",
          completedAt: new Date("2025-01-01T00:00:00Z"),
        }),
      ],
      today,
      "America/Lima",
    );
    expect(d.weekly.at(-1)).toEqual({ week: "2026-10-26", completed: 1 });
    expect(d.weekly.at(-2)).toEqual({ week: "2026-10-19", completed: 1 });
    expect(d.weekly[0].week).toBe("2026-08-10");
    expect(d.weekly.reduce((s, w) => s + w.completed, 0)).toBe(2);
  });

  it("lists the most overdue first, five at most", () => {
    const rows = [
      "2026-10-10",
      "2026-10-01",
      "2026-10-20",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ].map((dueAt, i) => row({ userId: `u${i}`, state: "OVERDUE", dueAt }));
    const d = dashboardOf(rows, today, "UTC");
    expect(d.attention.map((a) => a.dueAt)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-10",
    ]);
  });

  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-29")).toBe("2026-10-26");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });
});

import type { DerivedState } from "./assignment-resolution";
import { mainNodeOf } from "../org/partition";

export interface MainNodeCompliance {
  mainNodeId: string;
  total: number;
  completed: number;
  overdue: number;
  inProgress: number;
  notStarted: number;
  /** Rounded integer 0..100, or null when total === 0. */
  rate: number | null;
}

type ComplianceRow = {
  area: { id: string } | null;
  state: DerivedState;
};

/**
 * Aggregates mandatory compliance rows by top-level main node (rolling up all child sub-areas
 * into their root via `mainNodeOf`). Uses the same rounding formula as `report-dashboard.ts`.
 */
export function complianceByMainNode(
  rows: readonly ComplianceRow[],
  mainNodeIds: readonly string[],
  parentOf: Map<string, string | null>,
): MainNodeCompliance[] {
  const buckets = new Map<string, Omit<MainNodeCompliance, "rate">>(
    mainNodeIds.map((mainNodeId) => [
      mainNodeId,
      {
        mainNodeId,
        total: 0,
        completed: 0,
        overdue: 0,
        inProgress: 0,
        notStarted: 0,
      },
    ]),
  );

  for (const row of rows) {
    if (!row.area?.id) continue;
    const rootId = mainNodeOf(row.area.id, parentOf);
    if (!rootId) continue;
    const bucket = buckets.get(rootId);
    if (!bucket) continue;

    bucket.total += 1;
    switch (row.state) {
      case "COMPLETED":
        bucket.completed += 1;
        break;
      case "OVERDUE":
        bucket.overdue += 1;
        break;
      case "IN_PROGRESS":
        bucket.inProgress += 1;
        break;
      case "NOT_STARTED":
        bucket.notStarted += 1;
        break;
    }
  }

  return [...buckets.values()].map((b) => ({
    ...b,
    rate: b.total > 0 ? Math.round((b.completed / b.total) * 100) : null,
  }));
}

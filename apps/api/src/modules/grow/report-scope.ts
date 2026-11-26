import { Capability, UserRole } from "@prisma/client";
import { isCrosser } from "../org/partition";
import { subtreeOf } from "../org/org-tree";

/** Which people a user may see in reports: everyone, the members of some areas, or nobody (null → 403). */
export type ReportScope =
  | { all: true }
  | { all: false; nodeIds: Set<string> }
  | null;

/**
 * ADMIN, tenant MANAGER and holders of GROW_COURSE_MANAGE see the whole organization; an area manager
 * sees the areas they manage and every area below them (D8). Anyone else sees no reports.
 */
export function reportScope(
  user: { role: UserRole | string; capabilities: (Capability | string)[] },
  managedNodeIds: string[],
  parentOf: Map<string, string | null>,
): ReportScope {
  if (isCrosser(user)) return { all: true };
  if (managedNodeIds.length === 0) return null;
  return { all: false, nodeIds: subtreeOf(managedNodeIds, parentOf) };
}

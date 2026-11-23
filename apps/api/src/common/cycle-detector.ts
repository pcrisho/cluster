import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Pre-flight check: would moving `nodeIdBeingMoved` under `newParentId`
 * create a cycle in the org_nodes tree?
 *
 * Uses a recursive CTE to walk ancestors of newParentId. If we reach
 * nodeIdBeingMoved during the walk, the move would create a cycle.
 *
 * Per D-Q5: cycles are impossible by design (manager is User, not OrgNode,
 * and partial unique index enforces 1 manager = 1 node). However, parentId
 * is OrgNode → OrgNode self-reference, so cycles ARE possible if a node
 * is moved under its own descendant. This check is mandatory.
 */
export async function wouldCreateCycle(
  prisma: PrismaClient | Prisma.TransactionClient,
  orgId: string,
  nodeIdBeingMoved: string,
  newParentId: string | null,
): Promise<boolean> {
  if (!newParentId) return false;
  if (nodeIdBeingMoved === newParentId) return true;

  const result = await prisma.$queryRaw<{ would_cycle: boolean }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId", "organizationId"
      FROM org_nodes
      WHERE id = ${newParentId} AND "organizationId" = ${orgId}
      UNION ALL
      SELECT n.id, n."parentId", n."organizationId"
      FROM org_nodes n
      INNER JOIN ancestors a ON n.id = a."parentId"
      WHERE n."organizationId" = ${orgId}
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = ${nodeIdBeingMoved}) AS would_cycle
  `;

  return result[0]?.would_cycle ?? false;
}

/**
 * Pre-flight check: is the target depth within the org's max depth?
 * Default 6, max 8 (D11 decision).
 */
export async function getDepthFromParent(
  prisma: PrismaClient | Prisma.TransactionClient,
  orgId: string,
  parentId: string | null,
): Promise<number> {
  if (!parentId) return 0;
  const result = await prisma.$queryRaw<{ depth: number }[]>`
    WITH RECURSIVE tree AS (
      SELECT id, "parentId", "organizationId", 0 AS depth
      FROM org_nodes
      WHERE id = ${parentId} AND "organizationId" = ${orgId}
      UNION ALL
      SELECT n.id, n."parentId", n."organizationId", t.depth + 1
      FROM org_nodes n
      INNER JOIN tree t ON n.id = t."parentId"
      WHERE n."organizationId" = ${orgId}
    )
    SELECT MAX(depth) AS depth FROM tree
  `;
  return result[0]?.depth ?? 0;
}

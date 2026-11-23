import { nodeInScope, type PartitionScope } from "../org/partition"

/** What decides the partition of an access entry: the person's node, the area itself, or the position's node. */
export interface EntryPartition {
  user: { profile: { orgNodeId: string | null } | null } | null
  orgNodeId: string | null
  position: { orgNodeId: string | null } | null
}

/** An entry is shown and changeable when the principal it grants is in the caller's scope (node-partitions rule 7). */
export function entryInScope(scope: PartitionScope, entry: EntryPartition): boolean {
  if (entry.user) return nodeInScope(scope, entry.user.profile?.orgNodeId ?? null)
  // A global position (no node) reaches every main node, so only a crosser sees or changes its entry.
  if (entry.position) return nodeInScope(scope, entry.position.orgNodeId)
  return nodeInScope(scope, entry.orgNodeId)
}

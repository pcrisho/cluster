/** The `data-drop-area` of the "Unassigned" group, which is not an area. */
export const UNASSIGNED = "none"

export interface AssignmentPlan {
  /** The area to put the person in; null takes them out of every area. */
  orgNodeId: string | null
  /** Set when the position has to go: it belongs to the area they leave. */
  clearedPosition: { id: string; name: string } | null
}

export type AssignmentResolution =
  | { kind: "same" }
  | { kind: "ok"; plan: AssignmentPlan }

/**
 * What dropping a person on an area (or on "Unassigned", `targetAreaId` null) does. A position
 * that belongs to another area cannot stay (the API refuses it), so it goes and the toast says so.
 * `positionArea` answers which area a position belongs to; null means it is global.
 */
export function resolveAssignment(
  person: {
    orgNodeId: string | null
    position: { id: string; name: string } | null
  },
  targetAreaId: string | null,
  positionArea: (positionId: string) => string | null
): AssignmentResolution {
  if (person.orgNodeId === targetAreaId) return { kind: "same" }
  const own = person.position ? positionArea(person.position.id) : null
  const leaves = targetAreaId === null || (own !== null && own !== targetAreaId)
  return {
    kind: "ok",
    plan: {
      orgNodeId: targetAreaId,
      clearedPosition: leaves && person.position ? person.position : null,
    },
  }
}

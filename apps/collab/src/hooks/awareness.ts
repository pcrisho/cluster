import type { beforeHandleAwarenessPayload } from "@hocuspocus/server"
import type { Log } from "../log"
import type { CollabSession } from "../types"

const MAX_CURSOR_JSON_LENGTH = 2000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A cursor is the relative positions the editor sends: a small plain object (or null). */
function isSmallCursor(cursor: unknown): boolean {
  if (cursor === null) return true
  return (
    isRecord(cursor) && JSON.stringify(cursor).length <= MAX_CURSOR_JSON_LENGTH
  )
}

/**
 * Presence is rewritten on the server: the user always comes from the authorized session, readers
 * keep their entry in the list but never a cursor, and nothing else the client sends is relayed.
 * A connection also cannot write the presence of someone else's awareness client.
 */
export function createBeforeHandleAwareness(log: Log) {
  return async ({
    connection,
    context,
    document,
    states,
    removedClients,
  }: beforeHandleAwarenessPayload<CollabSession>): Promise<void> => {
    // Updates made by the server itself (direct connections) have no connection or context.
    if (!connection || !context) return

    const owned = document.getClients(connection)
    const foreign = new Set<number>()
    for (const other of document.getConnections()) {
      if (other === connection || other.context?.userId === context.userId)
        continue
      for (const clientId of document.getClients(other)) foreign.add(clientId)
    }

    let claimed = 0
    for (const [clientId, state] of [...states]) {
      if (foreign.has(clientId)) {
        states.delete(clientId)
        log("awareness-spoof-dropped", {
          documentName: document.name,
          userId: context.userId,
          socketId: connection.socketId,
        })
        continue
      }
      if (!isRecord(state)) {
        states.delete(clientId)
        continue
      }
      // A browser has one awareness client; a second one on the same connection is not legitimate.
      if (!owned.has(clientId)) {
        if (owned.size + claimed >= 1) {
          states.delete(clientId)
          continue
        }
        claimed += 1
      }
      const next: Record<string, unknown> = {
        user: {
          userId: context.userId,
          name: context.name,
          color: context.color,
          avatarUrl: context.avatarUrl,
          mode: context.mode,
        },
      }
      if (
        context.mode === "WRITE" &&
        "cursor" in state &&
        isSmallCursor(state.cursor)
      )
        next.cursor = state.cursor
      states.set(clientId, next)
    }

    for (const clientId of [...removedClients]) {
      if (foreign.has(clientId)) removedClients.delete(clientId)
    }
  }
}

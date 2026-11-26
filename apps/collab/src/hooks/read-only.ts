import type { beforeSyncPayload } from "@hocuspocus/server"
import type { Log } from "../log"
import type { CollabSession } from "../types"

const YJS_UPDATE = 2

/**
 * Hocuspocus already ignores updates from read-only connections; this only records the attempt.
 * Sync steps 1 and 2 are the normal handshake of a reader, so only a live update counts.
 */
export function createBeforeSync(log: Log) {
  return async ({
    connection,
    type,
    documentName,
  }: beforeSyncPayload<CollabSession>): Promise<void> => {
    if (!connection.readOnly || type !== YJS_UPDATE) return
    log("readonly-update-ignored", {
      documentName,
      userId: connection.context?.userId,
      socketId: connection.socketId,
    })
  }
}

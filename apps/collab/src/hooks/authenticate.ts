import type { onAuthenticatePayload } from "@hocuspocus/server"
import { CollabApiError, type ApiClient } from "../api-client"
import { parseDocumentName } from "../document-name"
import type { Log } from "../log"
import type { CollabSession } from "../types"

/** Hocuspocus sends `reason` to the client; "unavailable" tells it to retry later, unlike a denial. */
function rejection(reason: "permission-denied" | "unavailable") {
  return Object.assign(new Error(reason), { reason })
}

/**
 * Authorizes a connection against the API. The returned session becomes the connection's context
 * (identity comes from the server, never from the client). Every denial looks the same, so a
 * missing document cannot be told apart from a forbidden one.
 */
export function createAuthenticate(
  api: Pick<ApiClient, "authorize">,
  log: Log
) {
  return async ({
    token,
    documentName,
    socketId,
    connectionConfig,
  }: onAuthenticatePayload): Promise<CollabSession> => {
    const deny = (reason: string) => {
      log("auth-denied", { documentName, socketId, reason })
      return rejection("permission-denied")
    }
    if (typeof token !== "string" || token === "") throw deny("missing-token")
    try {
      parseDocumentName(documentName)
    } catch {
      throw deny("invalid-document-name")
    }
    try {
      const session = await api.authorize(token, documentName)
      connectionConfig.readOnly = session.mode === "READ"
      return session
    } catch (error) {
      if (error instanceof CollabApiError && error.kind !== "unavailable")
        throw deny(error.kind)
      log("auth-unavailable", { documentName, socketId })
      throw rejection("unavailable")
    }
  }
}

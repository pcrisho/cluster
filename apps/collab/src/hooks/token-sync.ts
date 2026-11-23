import type { onTokenSyncPayload } from "@hocuspocus/server";
import { applySession, isRevocation } from "../access";
import type { ApiClient } from "../api-client";
import type { Log } from "../log";
import type { CollabSession } from "../types";

/**
 * The browser sends a fresh token every few minutes. Authorizing it again keeps the mode up to
 * date and ends the session of someone who can no longer open the document. A thrown error closes
 * the document session (not the socket); the reason reaches the browser.
 */
export function createTokenSync(api: Pick<ApiClient, "authorize">, log: Log) {
  return async ({
    token,
    documentName,
    connection,
  }: onTokenSyncPayload<CollabSession>): Promise<void> => {
    let session: CollabSession;
    try {
      session = await api.authorize(token, documentName);
    } catch (error) {
      if (isRevocation(error)) throw revoked(log, documentName, connection);
      // The API cannot answer: the session stays, the periodic recheck tries again.
      log("token-sync-failed", { documentName });
      return;
    }
    if (session.userId !== connection.context.userId)
      throw revoked(log, documentName, connection);
    // A password change opens a new session on the same device: rechecks follow the latest one.
    connection.context.sessionId = session.sessionId;
    applySession(connection, session);
  };
}

function revoked(
  log: Log,
  documentName: string,
  connection: { context: CollabSession },
) {
  log("access-revoked", { documentName, userId: connection.context.userId });
  return Object.assign(new Error("access-revoked"), {
    reason: "access-revoked",
  });
}

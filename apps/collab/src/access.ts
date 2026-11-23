import type { Connection, Hocuspocus } from "@hocuspocus/server";
import { CollabApiError, type ApiClient } from "./api-client";
import { parseDocumentName } from "./document-name";
import type { Log } from "./log";
import type { CollabSession } from "./types";

/** Close reason the browser reads when a session ends because the person lost access. */
export const ACCESS_REVOKED = { code: 4403, reason: "access-revoked" };

type Live = Pick<
  Connection<CollabSession>,
  "readOnly" | "context" | "sendStateless" | "close"
>;

/**
 * Makes a live connection match the access the API just reported. Hocuspocus does not tell the
 * client when `readOnly` changes, so the person gets a stateless message instead.
 */
export function applySession(connection: Live, session: CollabSession): void {
  const readOnly = session.mode === "READ";
  if (connection.readOnly === readOnly) return;
  connection.readOnly = readOnly;
  // Presence reads the mode from the context: a reader must stop relaying a cursor at once.
  connection.context.mode = session.mode;
  connection.sendStateless(
    JSON.stringify({ type: "access-changed", mode: session.mode }),
  );
}

/** The API says the person cannot open the document at all (or no longer exists for them). */
export function isRevocation(error: unknown): boolean {
  return (
    error instanceof CollabApiError &&
    (error.kind === "forbidden" ||
      error.kind === "not_found" ||
      error.kind === "unauthorized")
  );
}

export type RecheckScope =
  | { scope: "all" }
  | { scope: "page" | "user"; id: string };

/**
 * Asks the API again what each live connection in the scope may do. Best effort: when the API
 * cannot answer nobody loses their session (the periodic recheck and the next token refresh
 * try again). There is no space scope: the API does not tell this service which space a page
 * belongs to, so a change to a space rechecks every connection, and the API stays the authority.
 */
export async function recheck(
  instance: Pick<Hocuspocus, "documents">,
  api: Pick<ApiClient, "authorizeUser">,
  scope: RecheckScope,
  log: Log,
): Promise<void> {
  const checks: Promise<void>[] = [];
  for (const [documentName, document] of instance.documents) {
    if (scope.scope === "page" && !isPage(documentName, scope.id)) continue;
    for (const connection of document.getConnections()) {
      const { userId, sessionId } = connection.context as CollabSession;
      if (scope.scope === "user" && userId !== scope.id) continue;
      checks.push(check(connection, documentName, userId, sessionId));
    }
  }
  await Promise.all(checks);

  async function check(
    connection: Connection<CollabSession>,
    documentName: string,
    userId: string,
    sessionId: string | undefined,
  ) {
    try {
      applySession(
        connection,
        await api.authorizeUser(userId, documentName, sessionId),
      );
    } catch (error) {
      if (isRevocation(error)) {
        log("access-revoked", { documentName, userId });
        connection.close(ACCESS_REVOKED);
      } else {
        log("recheck-failed", { documentName, userId });
      }
    }
  }
}

function isPage(documentName: string, id: string): boolean {
  try {
    return parseDocumentName(documentName).id === id;
  } catch {
    return false;
  }
}

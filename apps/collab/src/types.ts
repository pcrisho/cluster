/** Page fields kept next to the Yjs state, read by the API for search and listings. */
export interface CollabFields {
  body: Record<string, unknown>;
  title: string;
}

/** Response of POST /internal/collab/authorize. */
export interface CollabSession {
  userId: string;
  orgId: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  mode: "READ" | "WRITE";
  /** The auth session of the token that opened the connection; sent back on every recheck. */
  sessionId?: string;
}

export interface LoadedDocument {
  ydoc: Uint8Array | null;
  revision: number;
  fields: CollabFields;
}

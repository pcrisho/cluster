import type { CollabFields, CollabSession, LoadedDocument } from "./types";

export type CollabApiErrorKind =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_large"
  | "invalid"
  | "unavailable";

/** `status` is undefined when no HTTP answer arrived (network error or timeout). */
export class CollabApiError extends Error {
  constructor(
    readonly kind: CollabApiErrorKind,
    readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "CollabApiError";
  }
}

export interface ApiClientOptions {
  /** Base URL of the API including the global prefix, e.g. http://api:3001/api/v1 */
  apiUrl: string;
  secret: string;
  timeoutMs?: number;
}

const RETRY_DELAY_MS = 200;

const KIND_BY_STATUS: Partial<Record<number, CollabApiErrorKind>> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "too_large",
  422: "invalid",
};

/**
 * Client of the API's internal collab routes. Every call is safe to repeat,
 * so a call that fails as "unavailable" is retried once; 4xx answers never are.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = `${options.apiUrl.replace(/\/+$/, "")}/internal/collab`;
    this.secret = options.secret;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  authorize(token: string, documentName: string): Promise<CollabSession> {
    return this.request("POST", "/authorize", { token, documentName });
  }

  authorizeUser(
    userId: string,
    documentName: string,
    sessionId?: string,
  ): Promise<CollabSession> {
    return this.request("POST", "/authorize-user", {
      userId,
      documentName,
      ...(sessionId && { sessionId }),
    });
  }

  async loadDocument(kind: string, id: string): Promise<LoadedDocument> {
    const raw = await this.request<{
      ydoc: string | null;
      revision: number;
      fields: CollabFields;
    }>("GET", documentPath(kind, id));
    return {
      ydoc:
        raw.ydoc === null
          ? null
          : new Uint8Array(Buffer.from(raw.ydoc, "base64")),
      revision: raw.revision,
      fields: raw.fields,
    };
  }

  async seedDocument(
    kind: string,
    id: string,
    ydoc: Uint8Array,
  ): Promise<void> {
    await this.request("PUT", `${documentPath(kind, id)}/seed`, {
      ydoc: encode(ydoc),
    });
  }

  async storeDocument(
    kind: string,
    id: string,
    state: { ydoc: Uint8Array; fields: CollabFields; editors: string[] },
  ): Promise<void> {
    await this.request("PUT", documentPath(kind, id), {
      ydoc: encode(state.ydoc),
      fields: state.fields,
      editors: state.editors,
    });
  }

  private async request<T = void>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    try {
      return await this.send<T>(method, path, body);
    } catch (error) {
      if (!(error instanceof CollabApiError) || error.kind !== "unavailable")
        throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return this.send<T>(method, path, body);
    }
  }

  private async send<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "X-Collab-Secret": this.secret,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw new CollabApiError(
          KIND_BY_STATUS[response.status] ??
            (response.status >= 500 ? "unavailable" : "bad_request"),
          response.status,
          `collab API answered ${response.status}`,
        );
      }
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      if (error instanceof CollabApiError) throw error;
      // Connection refused, timeout, or a body that cannot be read or parsed.
      throw new CollabApiError(
        "unavailable",
        undefined,
        "collab API is unavailable",
      );
    }
  }
}

function documentPath(kind: string, id: string): string {
  return `/documents/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;
}

function encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

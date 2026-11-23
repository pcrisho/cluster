import { Injectable, ServiceUnavailableException } from "@nestjs/common"
import { CollabConfig } from "./collab.config"

export type RecheckScope = { scope: "all" } | { scope: "page" | "user"; id: string }

const NOTIFY_TIMEOUT_MS = 3_000
/** `flush` and `replace` wait for collab to save. */
const SAVE_TIMEOUT_MS = 30_000

/**
 * The API's calls to the collab service (POST /control/*). Callers wrap `recheck` and `close` in
 * `bestEffort`: a collab outage must never fail the user's action. `flush` and `replace` are the
 * exception: a version or a restore only succeeds once the live document is saved.
 */
@Injectable()
export class CollabClient {
  constructor(private readonly config: CollabConfig) {}

  /** Asks collab to re-authorize the open connections in the scope (it answers before finishing). */
  recheck(scope: RecheckScope): Promise<void> {
    return this.post("recheck", scope, NOTIFY_TIMEOUT_MS)
  }

  /** The document was deleted: collab closes its connections and drops it without saving. */
  close(documentName: string): Promise<void> {
    return this.post("close", { documentName }, NOTIFY_TIMEOUT_MS)
  }

  /** Saves the live document now and waits for it. Fails with 503 when collab cannot do it. */
  flush(documentName: string): Promise<void> {
    return this.mustSucceed("flush", { documentName }, SAVE_TIMEOUT_MS)
  }

  /** Replaces the live body and waits for the save. Fails with 503 when collab cannot do it. */
  replace(documentName: string, body: unknown): Promise<void> {
    return this.mustSucceed("replace", { documentName, body }, SAVE_TIMEOUT_MS)
  }

  private async mustSucceed(action: string, payload: unknown, timeoutMs: number): Promise<void> {
    try {
      await this.post(action, payload, timeoutMs)
    } catch {
      throw new ServiceUnavailableException({
        code: "COLLAB_UNAVAILABLE",
        message: "Live editing is unavailable, try again in a moment",
      })
    }
  }

  private async post(action: string, payload: unknown, timeoutMs: number): Promise<void> {
    const secret = this.config.secret
    if (!secret) throw new Error("COLLAB_INTERNAL_SECRET is not set")
    const response = await fetch(`${this.config.url}/control/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Collab-Secret": secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`collab /control/${action} answered ${response.status}`)
  }
}

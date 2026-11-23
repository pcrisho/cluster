import type {
  Hocuspocus,
  onRequestPayload,
  onStoreDocumentPayload,
} from "@hocuspocus/server"
import { createHash, timingSafeEqual } from "node:crypto"
import { recheck, type RecheckScope } from "./access"
import { CollabApiError, type ApiClient } from "./api-client"
import { InvalidContentError, replaceBody } from "./convert"
import { parseDocumentName } from "./document-name"
import { DELETED } from "./hooks/documents"
import type { Log } from "./log"

/** A restored body is as big as a page; the API already limits the document to 10 MB. */
const MAX_BODY_BYTES = 16 * 1024 * 1024

export interface ControlDeps {
  secret: string
  api: Pick<ApiClient, "authorizeUser">
  log: Log
  /** Forget a deleted page's document so it is never saved again. */
  discard: (documentName: string) => void
  /** Whether the last save of the document failed (Hocuspocus swallows that error). */
  storeFailed: (documentName: string) => boolean
}

class BadRequest extends Error {}

/**
 * Routes the API calls to POST /control/*: recheck access, close a deleted page, save now, and
 * replace the body (restore a version). The secret is compared in constant time; the proxy never
 * publishes this path. `handle` returns true when the request was a control request.
 */
export function createControl(deps: ControlDeps) {
  const secretHash = sha256(deps.secret)
  const background = new Set<Promise<void>>()

  async function handle({
    request,
    response,
    instance,
  }: onRequestPayload): Promise<boolean> {
    const path = new URL(request.url ?? "/", "http://localhost").pathname
    if (!path.startsWith("/control/")) return false
    const send = (status: number, body: unknown = { ok: status < 400 }) => {
      response.writeHead(status, { "Content-Type": "application/json" })
      response.end(JSON.stringify(body))
    }
    if (request.method !== "POST") return send(405), true
    const given = request.headers["x-collab-secret"]
    if (typeof given !== "string" || !timingSafeEqual(sha256(given), secretHash))
      return send(401), true

    try {
      const body = await readJson(request)
      switch (path) {
        case "/control/recheck":
          startRecheck(instance, parseScope(body))
          return send(202), true
        case "/control/close":
          close(instance, documentNameOf(body))
          return send(200), true
        case "/control/flush":
          await flush(instance, documentNameOf(body))
          return send(200), true
        case "/control/replace":
          await replace(instance, documentNameOf(body), (body as Body).body)
          return send(200), true
        default:
          return send(404), true
      }
    } catch (error) {
      send(...statusOf(error, deps.log))
      return true
    }
  }

  /** Answers 202 at once; the API does not wait for one call per connection. */
  function startRecheck(instance: Hocuspocus, scope: RecheckScope) {
    const run = recheck(instance, deps.api, scope, deps.log)
      .catch(() => deps.log("recheck-failed", {}))
      .finally(() => background.delete(run))
    background.add(run)
  }

  function close(instance: Hocuspocus, documentName: string) {
    deps.discard(documentName)
    for (const connection of instance.documents
      .get(documentName)
      ?.getConnections() ?? [])
      connection.close(DELETED)
  }

  /** Saves the live document now. Nothing is open: the stored state is already the latest. */
  async function flush(instance: Hocuspocus, documentName: string) {
    const document = instance.documents.get(documentName)
    if (!document) return
    const payload: onStoreDocumentPayload = {
      clientsCount: document.getConnectionsCount(),
      document,
      lastContext: undefined,
      lastTransactionOrigin: undefined,
      documentName,
      instance,
    }
    await instance.storeDocumentHooks(document, payload, true)
    if (deps.storeFailed(documentName))
      throw new CollabApiError("unavailable", undefined, "the save failed")
  }

  async function replace(
    instance: Hocuspocus,
    documentName: string,
    body: unknown
  ) {
    if (typeof body !== "object" || body === null)
      throw new BadRequest("body is required")
    const direct = await instance.openDirectConnection(documentName, {})
    try {
      await direct.transact((document) => replaceBody(document, body))
      await flush(instance, documentName)
    } finally {
      await direct.disconnect()
    }
  }

  return {
    handle,
    /** Resolves when the rechecks started so far are done (tests). */
    settled: async () => void (await Promise.all([...background])),
  }
}

interface Body {
  scope?: unknown
  id?: unknown
  documentName?: unknown
  body?: unknown
}

function parseScope(body: unknown): RecheckScope {
  const { scope, id } = body as Body
  if (scope === "all") return { scope }
  if ((scope === "page" || scope === "user") && typeof id === "string" && id)
    return { scope, id }
  throw new BadRequest("scope must be all, page or user (with an id)")
}

function documentNameOf(body: unknown): string {
  const { documentName } = body as Body
  try {
    if (typeof documentName !== "string") throw new Error()
    parseDocumentName(documentName)
    return documentName
  } catch {
    throw new BadRequest("documentName is not valid")
  }
}

async function readJson(request: onRequestPayload["request"]): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new BadRequest("body too large")
    chunks.push(chunk as Buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (typeof parsed !== "object" || parsed === null) throw new Error()
    return parsed
  } catch {
    throw new BadRequest("body must be a JSON object")
  }
}

function statusOf(error: unknown, log: Log): [number, unknown] {
  if (error instanceof BadRequest) return [400, { message: error.message }]
  if (error instanceof InvalidContentError) return [422, { message: error.message }]
  if (error instanceof CollabApiError && error.kind === "not_found")
    return [404, { message: "document not found" }]
  log("control-failed", {
    reason: error instanceof Error ? error.name : "unknown",
  })
  return [503, { message: "the service could not complete the request" }]
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}

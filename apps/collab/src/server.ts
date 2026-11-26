import { Server } from "@hocuspocus/server"
import { createControl } from "./control"
import { recheck } from "./access"
import { ApiClient } from "./api-client"
import type { CollabConfig } from "./config"
import { createAuthenticate } from "./hooks/authenticate"
import { createBeforeHandleAwareness } from "./hooks/awareness"
import { createDocumentHooks } from "./hooks/documents"
import { createTokenSync } from "./hooks/token-sync"
import { createBeforeSync } from "./hooks/read-only"
import { jsonLog, type Log } from "./log"
import { isAllowedOrigin } from "./origins"

export interface CollabServerDeps {
  /** Defaults to a client built from the config; tests pass a fake. */
  api?: Pick<
    ApiClient,
    | "authorize"
    | "authorizeUser"
    | "loadDocument"
    | "seedDocument"
    | "storeDocument"
  >
  log?: Log
  /** Saves wait for this long after the last change (and at most the max while people keep typing). */
  debounceMs?: number
  maxDebounceMs?: number
  retryDelaysMs?: number[]
  /** Safety net: every connection is rechecked this often even if nobody called /control/recheck. */
  recheckIntervalMs?: number
}

/**
 * Hocuspocus server: origin check, /health, authorization through the API, read-only enforcement
 * and server-side presence. It does not read process.env: the caller passes the config.
 */
export function createCollabServer(
  config: CollabConfig,
  deps: CollabServerDeps = {}
): Server {
  const api =
    deps.api ?? new ApiClient({ apiUrl: config.apiUrl, secret: config.secret })
  const log = deps.log ?? jsonLog
  const documents = createDocumentHooks(api, log, {
    retryDelaysMs: deps.retryDelaysMs,
  })
  const control = createControl({
    secret: config.secret,
    api,
    log,
    discard: documents.discard,
    storeFailed: documents.storeFailed,
  })
  const server = new Server({
    name: "cluster-collab",
    port: config.port,
    quiet: true,
    debounce: deps.debounceMs ?? 2000,
    maxDebounce: deps.maxDebounceMs ?? 10000,
    // maxPayload is not set: config.maxDocBytes is a document size, not a message size.
    // stopOnSignals stays at its default (true): the library closes on SIGINT/SIGTERM.

    // Hocuspocus swallows a falsy throw as "handled" and skips crossws.handleUpgrade.
    onUpgrade: async ({ request, socket }) => {
      if (isAllowedOrigin(request.headers.origin, config.allowedOrigins)) return
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
      socket.destroy()
      throw null
    },

    // Same falsy-throw convention: stops the default "Welcome to Hocuspocus!" reply.
    onRequest: async (payload) => {
      const { request, response, instance } = payload
      if (await control.handle(payload)) throw null
      const path = new URL(request.url ?? "/", "http://localhost").pathname
      if (request.method !== "GET" || path !== "/health") return
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(
        JSON.stringify({
          documents: instance.getDocumentsCount(),
          connections: instance.getConnectionsCount(),
          uptime: Math.floor(process.uptime()),
        })
      )
      throw null
    },

    onAuthenticate: createAuthenticate(api, log),
    onTokenSync: createTokenSync(api, log),
    onLoadDocument: documents.onLoadDocument,
    onChange: documents.onChange,
    onStoreDocument: documents.onStoreDocument,
    beforeHandleAwareness: createBeforeHandleAwareness(log),
    beforeSync: createBeforeSync(log),
  })

  const timer = setInterval(
    () => void recheck(server.hocuspocus, api, { scope: "all" }, log),
    deps.recheckIntervalMs ?? 5 * 60 * 1000
  )
  timer.unref()
  const destroy = server.destroy.bind(server)
  server.destroy = () => {
    clearInterval(timer)
    return destroy()
  }
  return server
}

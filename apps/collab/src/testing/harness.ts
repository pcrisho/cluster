import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider"
import type { Server } from "@hocuspocus/server"
import { randomUUID } from "node:crypto"
import WebSocket from "ws"
import * as Y from "yjs"
import { fieldsToYdoc, ydocToFields } from "../convert"
import type { CollabConfig } from "../config"
import { createCollabServer, type CollabServerDeps } from "../server"
import type { CollabFields, CollabSession } from "../types"
import type { createFakeApi } from "./fake-api"

export const ORIGIN = "http://localhost:3000"
export const SECRET = "0123456789abcdef"

export const config: CollabConfig = {
  port: 0,
  secret: SECRET,
  allowedOrigins: [ORIGIN],
  apiUrl: "http://localhost:1/api/v1",
  maxDocBytes: 10485760,
}

export const session = (
  userId: string,
  name: string,
  mode: CollabSession["mode"],
  color: string
): CollabSession => ({
  userId,
  orgId: "org-1",
  name,
  avatarUrl: null,
  color,
  mode,
})
export const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
})
export const fields = (text: string, title = "Page title"): CollabFields => ({
  body: { type: "doc", content: [paragraph(text)] },
  title,
})
export const FIELDS = fields("stored content")
/** What the service reads back from fields after they went through a Yjs document. */
export const normalized = (f: CollabFields) => ydocToFields(fieldsToYdoc(f))

class OriginWebSocket extends WebSocket {
  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols, { headers: { Origin: ORIGIN } })
  }
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

export const until = async (
  condition: () => boolean,
  what: string,
  timeoutMs = 5000
) => {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/**
 * The real collab server on a free port, real WebSocket clients and the in-memory API. Each test
 * calls `newPage()` for its own document: the server keeps documents (and deleted ones) in memory.
 */
export function createHarness(
  api: ReturnType<typeof createFakeApi>,
  serverOptions: Partial<CollabServerDeps> = {}
) {
  let server!: Server
  let url = ""
  let page = ""
  const providers: HocuspocusProvider[] = []
  const sockets: HocuspocusProviderWebsocket[] = []

  const connect = (token: string, name = page) => {
    const ydoc = new Y.Doc()
    const events = {
      synced: false,
      authenticated: false,
      failed: undefined as string | undefined,
      closes: [] as string[],
      stateless: [] as string[],
    }
    const socket = new HocuspocusProviderWebsocket({
      url,
      WebSocketPolyfill: OriginWebSocket as never,
    })
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name,
      document: ydoc,
      token,
      onSynced: () => (events.synced = true),
      onAuthenticated: () => (events.authenticated = true),
      onAuthenticationFailed: ({ reason }) => (events.failed = reason),
      // A closed document session reaches the client as its reason only; the numeric code is not sent.
      onClose: ({ event }) => events.closes.push(event.reason),
      onStateless: ({ payload }) => events.stateless.push(payload),
    })
    provider.attach()
    sockets.push(socket)
    providers.push(provider)
    return { ydoc, provider, events }
  }

  return {
    async start() {
      server = createCollabServer(config, {
        api,
        log: jest.fn(),
        debounceMs: 50,
        maxDebounceMs: 200,
        retryDelaysMs: [10, 10],
        ...serverOptions,
      })
      await server.listen()
      url = `ws://127.0.0.1:${server.address.port}`
    },
    async stop() {
      await server.destroy()
    },
    get server() {
      return server
    },
    get url() {
      return url
    },
    get page() {
      return page
    },
    /** A fresh page in the fake API; resets the API state too. */
    newPage(stored: CollabFields = FIELDS) {
      page = `know.page:${randomUUID()}`
      api.pages.clear()
      api.pages.set(page, { ydoc: null, revision: 0, fields: stored })
      api.stored.length = 0
      api.state.down = false
      api.state.seeds = 0
      api.state.storeErrors.length = 0
      api.denied.clear()
      return page
    },
    connect,
    async disconnectAll() {
      providers.splice(0).forEach((p) => p.destroy())
      sockets.splice(0).forEach((s) => s.destroy())
      await settle()
    },
  }
}

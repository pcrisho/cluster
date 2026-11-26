import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider"
import * as Y from "yjs"
import { documentName } from "./collab-url"

export type CollabStatus =
  | "connecting"
  | "connected"
  | "readonly"
  | "disconnected"
  | "denied"
  | "unavailable"
  | "deleted"

export type CollabMode = "READ" | "WRITE"

/** One collaborator, merged across tabs (same userId). */
export interface Peer {
  userId: string
  name: string
  color: string
  avatarUrl: string | null
  mode: CollabMode
  count: number
}

export interface CollabSnapshot {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  status: CollabStatus
  mode: CollabMode
  peers: Peer[]
  /** The document received the server state at least once; the Y.Doc holds real content. */
  synced: boolean
  /** Increases each time the local Y.Doc is discarded and rebuilt; editors remount on it. */
  generation: number
}

export interface CollabTransport {
  provider: HocuspocusProvider
  websocket: HocuspocusProviderWebsocket
}

export interface CollabSessionOptions {
  kind: string
  id: string
  getToken: () => Promise<string>
  url: string
  createProvider?: (args: {
    url: string
    name: string
    ydoc: Y.Doc
    token: () => Promise<string>
  }) => CollabTransport
}

export interface CollabSession {
  getSnapshot(): CollabSnapshot
  subscribe(listener: () => void): () => void
  destroy(): void
}

const RETRY_BASE_MS = 2_000
const RETRY_CAP_MS = 30_000

/** Close reasons the server sends when it rejected this client's changes. */
const REJECTED_CHANGES = new Set(["invalid-content", "document-too-large"])

const defaultCreateProvider: NonNullable<
  CollabSessionOptions["createProvider"]
> = ({ url, name, ydoc, token }) => {
  const websocket = new HocuspocusProviderWebsocket({ url })
  const provider = new HocuspocusProvider({
    websocketProvider: websocket,
    name,
    document: ydoc,
    token,
  })
  provider.attach()
  return { provider, websocket }
}

/**
 * One editing session on a collaborative document: a Y.Doc plus its provider, observable by React
 * through subscribe/getSnapshot. Hocuspocus reconnects the socket itself; this only decides what
 * the editor should show and when the local Y.Doc must be thrown away.
 */
export function createCollabSession(
  options: CollabSessionOptions
): CollabSession {
  const create = options.createProvider ?? defaultCreateProvider
  const name = documentName(options.kind, options.id)
  const listeners = new Set<() => void>()

  let destroyed = false
  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let transport!: CollabTransport // assigned by startTransport before any use
  let snapshot: CollabSnapshot

  const isFinal = () =>
    snapshot.status === "denied" || snapshot.status === "deleted"

  function publish(patch: Partial<CollabSnapshot>) {
    const next = { ...snapshot, ...patch }
    if (
      Object.keys(next).every((key) =>
        Object.is(
          next[key as keyof CollabSnapshot],
          snapshot[key as keyof CollabSnapshot]
        )
      )
    )
      return
    snapshot = next
    for (const listener of listeners) listener()
  }

  function refreshPeers() {
    const peers = groupPeers(
      transport.provider.awareness?.getStates().values() ?? []
    )
    if (JSON.stringify(peers) !== JSON.stringify(snapshot.peers))
      publish({ peers })
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
  }

  function scheduleRetry() {
    clearRetry()
    const delay = Math.min(RETRY_BASE_MS * 2 ** failures, RETRY_CAP_MS)
    failures += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void transport.provider.sendToken()
    }, delay)
  }

  /** Tears down the current transport and opens a brand-new Y.Doc and provider. */
  function startTransport() {
    const ydoc = new Y.Doc()
    transport = create({
      url: options.url,
      name,
      ydoc,
      token: options.getToken,
    })
    const { provider } = transport
    provider.on("authenticated", ({ scope }: { scope: string }) => {
      if (isFinal()) return
      failures = 0
      clearRetry()
      const readonly = scope === "readonly"
      publish({
        status: readonly ? "readonly" : "connected",
        mode: readonly ? "READ" : "WRITE",
      })
    })
    provider.on("authenticationFailed", ({ reason }: { reason: string }) => {
      if (isFinal()) return
      // Only an explicit denial is final; "unavailable" and a failed token fetch are transient.
      if (reason !== "permission-denied") {
        publish({ status: "unavailable" })
        scheduleRetry()
        return
      }
      clearRetry()
      publish({ status: "denied" })
      provider.detach()
    })
    provider.on("close", ({ event }: { event: { reason?: string } }) => {
      if (isFinal()) return
      const reason = event?.reason ?? ""
      if (reason === "document-deleted") {
        clearRetry()
        publish({ status: "deleted" })
        provider.detach()
      } else if (reason === "access-revoked") {
        // Final, like a denial at connect time: retrying would only be refused again.
        clearRetry()
        publish({ status: "denied" })
        provider.detach()
      } else if (REJECTED_CHANGES.has(reason)) {
        reload(ydoc)
      } else {
        publish({ status: "disconnected" })
      }
    })
    provider.on("status", ({ status }: { status: string }) => {
      if (status === "disconnected" && !isFinal())
        publish({ status: "disconnected" })
    })
    // The server changed this person's access while connected (their edits are already ignored).
    provider.on("stateless", ({ payload }: { payload: string }) => {
      const mode = accessChangedMode(payload)
      if (!mode || isFinal()) return
      publish({ status: mode === "READ" ? "readonly" : "connected", mode })
    })
    provider.on("synced", () => publish({ synced: true }))
    provider.on("awarenessChange", refreshPeers)
    provider.on("awarenessUpdate", refreshPeers)
    return ydoc
  }

  function reload(oldDoc: Y.Doc) {
    clearRetry()
    transport.provider.destroy()
    transport.websocket.destroy()
    oldDoc.destroy()
    const ydoc = startTransport()
    publish({
      ydoc,
      provider: transport.provider,
      status: "connecting",
      mode: "WRITE",
      peers: [],
      synced: false,
      generation: snapshot.generation + 1,
    })
  }

  const ydoc = startTransport()
  snapshot = {
    ydoc,
    provider: transport.provider,
    status: "connecting",
    mode: "WRITE",
    peers: [],
    synced: false,
    generation: 0,
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      clearRetry()
      transport.provider.destroy()
      transport.websocket.destroy()
      snapshot.ydoc.destroy()
      listeners.clear()
    },
  }
}

/** The mode in a stateless "access-changed" message, or undefined for anything else. */
function accessChangedMode(payload: string): CollabMode | undefined {
  try {
    const message = JSON.parse(payload) as { type?: unknown; mode?: unknown }
    if (message.type !== "access-changed") return undefined
    return message.mode === "READ" || message.mode === "WRITE"
      ? message.mode
      : undefined
  } catch {
    return undefined
  }
}

interface PeerState {
  user?: {
    userId?: unknown
    name?: string
    color?: string
    avatarUrl?: string | null
    mode?: CollabMode
  }
}

/**
 * Peers from awareness states. A state without a user (not yet identified, or a stale one) is
 * ignored; the same userId in several tabs becomes one peer with `count` tabs.
 */
export function groupPeers(states: Iterable<unknown>): Peer[] {
  const byUser = new Map<string, Peer>()
  for (const state of states) {
    const user = (state as PeerState | null)?.user
    if (typeof user?.userId !== "string") continue
    const existing = byUser.get(user.userId)
    if (existing) {
      existing.count += 1
      continue
    }
    byUser.set(user.userId, {
      userId: user.userId,
      name: user.name ?? "",
      color: user.color ?? "",
      avatarUrl: user.avatarUrl ?? null,
      mode: user.mode ?? "WRITE",
      count: 1,
    })
  }
  return [...byUser.values()]
}

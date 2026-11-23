import * as Y from "yjs"
import {
  createCollabSession,
  groupPeers,
  type CollabSessionOptions,
  type CollabTransport,
} from "./collab-session"

type Listener = (data: unknown) => void

/** Stands in for HocuspocusProvider: the test fires the same events the real one emits. */
class FakeProvider {
  listeners = new Map<string, Listener[]>()
  awareness = {
    states: new Map<number, unknown>(),
    getStates() {
      return this.states
    },
  }
  destroyed = false
  sendToken = jest.fn(async () => undefined)
  detach = jest.fn()
  destroy = jest.fn(() => {
    this.destroyed = true
    this.listeners.clear()
  })

  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }

  fire(event: string, data?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(data)
  }
}

const authenticated = (scope: "read-write" | "readonly") => ({ scope })
const denied = (reason: string) => ({ reason })
const closed = (reason: string) => ({ event: { code: 1000, reason } })

describe("createCollabSession", () => {
  let transports: {
    provider: FakeProvider
    websocket: { destroy: jest.Mock }
    ydoc: Y.Doc
  }[]
  let options: CollabSessionOptions
  let getToken: jest.Mock
  let factoryArgs: { name: string; url: string; token: unknown; ydoc: Y.Doc }[]

  const current = () => transports[transports.length - 1]

  beforeEach(() => {
    jest.useFakeTimers()
    transports = []
    factoryArgs = []
    getToken = jest.fn(async () => "token-1")
    options = {
      kind: "know.page",
      id: "page-1",
      url: "ws://collab.test",
      getToken,
      createProvider: (args) => {
        factoryArgs.push(args)
        const { ydoc } = args
        const provider = new FakeProvider()
        const websocket = { destroy: jest.fn() }
        transports.push({ provider, websocket, ydoc })
        return { provider, websocket } as unknown as CollabTransport
      },
    }
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("starts connecting with a Y.Doc and a provider for the document name", () => {
    const session = createCollabSession(options)
    const snapshot = session.getSnapshot()

    expect(snapshot.status).toBe("connecting")
    expect(snapshot.mode).toBe("WRITE")
    expect(snapshot.generation).toBe(0)
    expect(snapshot.ydoc).toBe(current().ydoc)
    expect(snapshot.provider).toBe(current().provider)
  })

  it("passes the token as a function so every reconnect re-reads it", async () => {
    createCollabSession(options)
    const token = factoryArgs[0].token
    expect(typeof token).toBe("function")
    await expect((token as () => Promise<string>)()).resolves.toBe("token-1")
    expect(factoryArgs[0].name).toBe("know.page:page-1")
    expect(factoryArgs[0].url).toBe("ws://collab.test")
  })

  it("becomes connected with read-write authentication", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticated", authenticated("read-write"))

    expect(session.getSnapshot().status).toBe("connected")
    expect(session.getSnapshot().mode).toBe("WRITE")
  })

  it("becomes readonly with mode READ on read-only authentication", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticated", authenticated("readonly"))

    expect(session.getSnapshot().status).toBe("readonly")
    expect(session.getSnapshot().mode).toBe("READ")
  })

  describe("access-changed", () => {
    const told = (data: unknown) =>
      current().provider.fire("stateless", { payload: JSON.stringify(data) })

    it("turns a connected editor read-only when the server demotes them", () => {
      const session = createCollabSession(options)
      current().provider.fire("authenticated", authenticated("read-write"))
      told({ type: "access-changed", mode: "READ" })
      expect(session.getSnapshot()).toMatchObject({
        status: "readonly",
        mode: "READ",
      })
    })

    it("turns a reader back into a writer when the server promotes them", () => {
      const session = createCollabSession(options)
      current().provider.fire("authenticated", authenticated("readonly"))
      told({ type: "access-changed", mode: "WRITE" })
      expect(session.getSnapshot()).toMatchObject({
        status: "connected",
        mode: "WRITE",
      })
    })

    it("ignores other messages, malformed payloads and unknown modes", () => {
      const session = createCollabSession(options)
      current().provider.fire("authenticated", authenticated("read-write"))
      const before = session.getSnapshot()
      told({ type: "something-else", mode: "READ" })
      told({ type: "access-changed", mode: "ADMIN" })
      current().provider.fire("stateless", { payload: "not json" })
      expect(session.getSnapshot()).toBe(before)
    })

    it("does not bring back a deleted or denied session", () => {
      const session = createCollabSession(options)
      current().provider.fire("close", closed("document-deleted"))
      told({ type: "access-changed", mode: "WRITE" })
      expect(session.getSnapshot().status).toBe("deleted")
    })
  })

  it("reports disconnected when the socket drops and recovers on its own", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticated", authenticated("read-write"))

    current().provider.fire("status", { status: "disconnected" })
    expect(session.getSnapshot().status).toBe("disconnected")

    current().provider.fire("authenticated", authenticated("read-write"))
    expect(session.getSnapshot().status).toBe("connected")
    expect(transports).toHaveLength(1)
  })

  it("remembers that the document synced, through disconnections, until it is rebuilt", () => {
    const session = createCollabSession(options)
    expect(session.getSnapshot().synced).toBe(false)

    current().provider.fire("authenticated", authenticated("read-write"))
    expect(session.getSnapshot().synced).toBe(false)

    current().provider.fire("synced", { state: true })
    expect(session.getSnapshot().synced).toBe(true)

    current().provider.fire("status", { status: "disconnected" })
    expect(session.getSnapshot().synced).toBe(true)

    current().provider.fire("close", closed("invalid-content"))
    expect(session.getSnapshot().synced).toBe(false)
  })

  it("treats a socket close with an unknown reason as disconnected, not as a reload", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticated", authenticated("read-write"))

    current().provider.fire("close", closed(""))

    expect(session.getSnapshot().status).toBe("disconnected")
    expect(session.getSnapshot().generation).toBe(0)
    expect(transports).toHaveLength(1)
  })

  it("is denied on permission-denied, detaches and never retries", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticationFailed", denied("permission-denied"))

    expect(session.getSnapshot().status).toBe("denied")
    expect(current().provider.detach).toHaveBeenCalled()

    jest.advanceTimersByTime(120_000)
    expect(current().provider.sendToken).not.toHaveBeenCalled()

    current().provider.fire("authenticated", authenticated("read-write"))
    expect(session.getSnapshot().status).toBe("denied")
  })

  it("retries instead of denying when the token could not be fetched", () => {
    const session = createCollabSession(options)
    current().provider.fire(
      "authenticationFailed",
      denied("Failed to get token during sendToken(): TypeError")
    )
    expect(session.getSnapshot().status).toBe("unavailable")

    jest.advanceTimersByTime(2_000)
    expect(current().provider.sendToken).toHaveBeenCalledTimes(1)
  })

  it("is unavailable on unavailable and retries with 2 s, 4 s, 8 s", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticationFailed", denied("unavailable"))
    expect(session.getSnapshot().status).toBe("unavailable")

    jest.advanceTimersByTime(1999)
    expect(current().provider.sendToken).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(current().provider.sendToken).toHaveBeenCalledTimes(1)

    current().provider.fire("authenticationFailed", denied("unavailable"))
    jest.advanceTimersByTime(3999)
    expect(current().provider.sendToken).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1)
    expect(current().provider.sendToken).toHaveBeenCalledTimes(2)

    current().provider.fire("authenticationFailed", denied("unavailable"))
    jest.advanceTimersByTime(8000)
    expect(current().provider.sendToken).toHaveBeenCalledTimes(3)
  })

  it("caps the unavailable retry delay at 30 s", () => {
    const session = createCollabSession(options)
    for (let i = 0; i < 5; i++) {
      current().provider.fire("authenticationFailed", denied("unavailable"))
      jest.advanceTimersByTime(30_000)
    }
    const before = current().provider.sendToken.mock.calls.length
    current().provider.fire("authenticationFailed", denied("unavailable"))
    jest.advanceTimersByTime(29_999)
    expect(current().provider.sendToken.mock.calls.length).toBe(before)
    jest.advanceTimersByTime(1)
    expect(current().provider.sendToken.mock.calls.length).toBe(before + 1)
    expect(session.getSnapshot().status).toBe("unavailable")
  })

  it("clears the retry when authentication succeeds", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticationFailed", denied("unavailable"))
    current().provider.fire("authenticated", authenticated("read-write"))

    jest.advanceTimersByTime(120_000)
    expect(current().provider.sendToken).not.toHaveBeenCalled()
    expect(session.getSnapshot().status).toBe("connected")
  })

  it("reloads with a new Y.Doc and provider on invalid-content, without reconnecting the old one", () => {
    const session = createCollabSession(options)
    const first = session.getSnapshot()
    const oldDoc = first.ydoc
    const destroyDoc = jest.spyOn(oldDoc, "destroy")
    current().provider.fire("authenticated", authenticated("read-write"))

    current().provider.fire("close", closed("invalid-content"))

    const second = session.getSnapshot()
    expect(transports).toHaveLength(2)
    expect(transports[0].provider.destroy).toHaveBeenCalled()
    expect(transports[0].websocket.destroy).toHaveBeenCalled()
    expect(destroyDoc).toHaveBeenCalled()
    expect(second.ydoc).not.toBe(oldDoc)
    expect(second.provider).not.toBe(first.provider)
    expect(second.generation).toBe(1)
    expect(second.status).toBe("connecting")
  })

  it("reloads on document-too-large the same way", () => {
    const session = createCollabSession(options)
    const oldDoc = session.getSnapshot().ydoc
    const destroyDoc = jest.spyOn(oldDoc, "destroy")

    current().provider.fire("close", closed("document-too-large"))

    expect(destroyDoc).toHaveBeenCalled()
    expect(transports).toHaveLength(2)
    expect(session.getSnapshot().generation).toBe(1)
    expect(session.getSnapshot().status).toBe("connecting")
  })

  it("is denied, final and detached when the server closes the session because access was revoked", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticated", authenticated("read-write"))

    current().provider.fire("close", closed("access-revoked"))
    expect(session.getSnapshot().status).toBe("denied")
    expect(current().provider.detach).toHaveBeenCalled()

    current().provider.fire("authenticated", authenticated("read-write"))
    current().provider.fire("status", { status: "disconnected" })
    expect(session.getSnapshot().status).toBe("denied")
    jest.advanceTimersByTime(60_000)
    expect(current().provider.sendToken).not.toHaveBeenCalled()
  })

  it("is deleted on document-deleted and stays final", () => {
    const session = createCollabSession(options)
    current().provider.fire("authenticated", authenticated("read-write"))

    current().provider.fire("close", closed("document-deleted"))
    expect(session.getSnapshot().status).toBe("deleted")
    expect(current().provider.detach).toHaveBeenCalled()

    current().provider.fire("authenticated", authenticated("read-write"))
    current().provider.fire("status", { status: "disconnected" })
    expect(session.getSnapshot().status).toBe("deleted")
    expect(transports).toHaveLength(1)
  })

  describe("peers", () => {
    it("groups the same user in several tabs into one peer with count 2", () => {
      const session = createCollabSession(options)
      const provider = current().provider
      provider.awareness.states.set(1, {
        user: {
          userId: "u1",
          name: "Ana",
          color: "#f00",
          avatarUrl: null,
          mode: "WRITE",
        },
      })
      provider.awareness.states.set(2, {
        user: {
          userId: "u1",
          name: "Ana",
          color: "#f00",
          avatarUrl: null,
          mode: "WRITE",
        },
      })
      provider.fire("awarenessChange", {})

      expect(session.getSnapshot().peers).toEqual([
        {
          userId: "u1",
          name: "Ana",
          color: "#f00",
          avatarUrl: null,
          mode: "WRITE",
          count: 2,
        },
      ])
    })

    it("ignores states without a user and recomputes on awareness update", () => {
      const session = createCollabSession(options)
      const provider = current().provider
      provider.awareness.states.set(1, { cursor: null })
      provider.fire("awarenessUpdate", {})
      expect(session.getSnapshot().peers).toEqual([])

      provider.awareness.states.set(2, {
        user: {
          userId: "u2",
          name: "Luis",
          color: "#0f0",
          avatarUrl: null,
          mode: "READ",
        },
      })
      provider.fire("awarenessUpdate", {})
      expect(session.getSnapshot().peers.map((p) => p.userId)).toEqual(["u2"])
    })
  })

  it("destroy is idempotent, tears everything down and leaves no timers", () => {
    const session = createCollabSession(options)
    const { provider, websocket } = current()
    const destroyDoc = jest.spyOn(session.getSnapshot().ydoc, "destroy")
    current().provider.fire("authenticationFailed", denied("unavailable"))
    expect(jest.getTimerCount()).toBe(1)

    session.destroy()
    session.destroy()

    expect(provider.destroy).toHaveBeenCalledTimes(1)
    expect(websocket.destroy).toHaveBeenCalledTimes(1)
    expect(destroyDoc).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(60_000)
    expect(provider.sendToken).not.toHaveBeenCalled()
  })

  it("keeps the same snapshot reference while nothing changed", () => {
    const session = createCollabSession(options)
    const first = session.getSnapshot()
    expect(session.getSnapshot()).toBe(first)

    current().provider.fire("awarenessUpdate", {})
    expect(session.getSnapshot()).toBe(first)

    current().provider.fire("authenticated", authenticated("read-write"))
    expect(session.getSnapshot()).not.toBe(first)
  })

  it("notifies subscribers until they unsubscribe", () => {
    const session = createCollabSession(options)
    const listener = jest.fn()
    const unsubscribe = session.subscribe(listener)

    current().provider.fire("authenticated", authenticated("read-write"))
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    current().provider.fire("status", { status: "disconnected" })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe("groupPeers", () => {
  const user = (
    userId: string,
    name: string,
    mode: "READ" | "WRITE" = "WRITE"
  ) => ({
    user: { userId, name, color: "#123", avatarUrl: null, mode },
  })

  it("groups by userId in first-seen order", () => {
    const peers = groupPeers([
      user("a", "Ana"),
      user("b", "Luis", "READ"),
      user("a", "Ana"),
    ])
    expect(peers).toEqual([
      {
        userId: "a",
        name: "Ana",
        color: "#123",
        avatarUrl: null,
        mode: "WRITE",
        count: 2,
      },
      {
        userId: "b",
        name: "Luis",
        color: "#123",
        avatarUrl: null,
        mode: "READ",
        count: 1,
      },
    ])
  })

  it("ignores null states and states without a user", () => {
    expect(
      groupPeers([null, { cursor: null }, {}, user("a", "Ana")]).map(
        (p) => p.userId
      )
    ).toEqual(["a"])
  })

  it("returns an empty list for no states", () => {
    expect(groupPeers([])).toEqual([])
  })
})

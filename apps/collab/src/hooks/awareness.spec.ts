import { createBeforeHandleAwareness } from "./awareness"
import type { CollabSession } from "../types"

const ctx = (over: Partial<CollabSession> = {}): CollabSession => ({
  userId: "user-1",
  orgId: "org-1",
  name: "Ana Pérez",
  avatarUrl: "http://x/a.png",
  color: "#e6194b",
  mode: "WRITE",
  ...over,
})

interface FakeConnection {
  context: CollabSession
}

/** A document whose connections own the given awareness client ids. */
const setup = (owned: Map<FakeConnection, number[]>, self: FakeConnection) => {
  const document = {
    getConnections: () => [...owned.keys()],
    getClients: (connection: FakeConnection) =>
      new Set(owned.get(connection) ?? []),
  }
  const log = jest.fn()
  const hook = createBeforeHandleAwareness(log)
  const run = (states: Map<number, unknown>, removed: number[] = []) => {
    const removedClients = new Set(removed)
    const payload = {
      connection: self,
      context: self.context,
      document,
      states,
      removedClients,
    } as never
    hook(payload)
    return {
      states: states as Map<number, Record<string, any>>,
      removedClients,
    }
  }
  return { run, log }
}

const fresh = (context = ctx()) => {
  const self: FakeConnection = { context }
  return { self, ...setup(new Map([[self, []]]), self) }
}

describe("beforeHandleAwareness", () => {
  it("leaves server-internal updates (no connection or context) alone", async () => {
    const states = new Map<number, unknown>([[1, { anything: true }]])
    const payload = {
      connection: undefined,
      context: undefined,
      document: {},
      states,
      removedClients: new Set(),
    }
    await createBeforeHandleAwareness(jest.fn())(payload as never)
    expect(states.get(1)).toEqual({ anything: true })
  })

  it("replaces the user with the one the server knows and keeps only the cursor besides it", () => {
    const { run } = fresh()
    const cursor = { anchor: { type: 1 }, head: { type: 2 } }
    const { states } = run(
      new Map([
        [
          7,
          {
            user: { name: "Mallory", color: "#000" },
            cursor,
            junk: "x".repeat(10_000),
          },
        ],
      ])
    )
    expect(states.get(7)).toEqual({
      user: {
        userId: "user-1",
        name: "Ana Pérez",
        color: "#e6194b",
        avatarUrl: "http://x/a.png",
        mode: "WRITE",
      },
      cursor,
    })
  })

  it("keeps a reader in the presence list but removes any cursor or selection", () => {
    const { run } = fresh(ctx({ mode: "READ" }))
    const { states } = run(
      new Map([
        [7, { user: { name: "Mallory" }, cursor: { anchor: 1, head: 2 } }],
      ])
    )
    expect(states.get(7)).toEqual({
      user: {
        userId: "user-1",
        name: "Ana Pérez",
        color: "#e6194b",
        avatarUrl: "http://x/a.png",
        mode: "READ",
      },
    })
  })

  it("drops a cursor that is not a small plain object", () => {
    const { run } = fresh()
    for (const bad of ["text", 42, [1, 2], { a: "x".repeat(3000) }]) {
      const { states } = run(new Map([[7, { cursor: bad }]]))
      expect(states.get(7)).not.toHaveProperty("cursor")
    }
    expect(run(new Map([[7, { cursor: null }]])).states.get(7)).toHaveProperty(
      "cursor",
      null
    )
  })

  it("deletes states that are not objects", () => {
    const { run } = fresh()
    const { states } = run(
      new Map<number, unknown>([
        [7, "nope"],
        [8, 5],
      ])
    )
    expect(states.size).toBe(0)
  })

  it("does not let a connection write the presence of a client owned by another person", () => {
    const victim: FakeConnection = { context: ctx({ userId: "victim" }) }
    const self: FakeConnection = { context: ctx({ userId: "mallory" }) }
    const { run, log } = setup(
      new Map([
        [victim, [100]],
        [self, []],
      ]),
      self
    )
    const { states, removedClients } = run(
      new Map([
        [100, { user: { name: "x" } }],
        [200, { cursor: null }],
      ]),
      [100]
    )
    expect(states.has(100)).toBe(false)
    expect(removedClients.has(100)).toBe(false)
    expect(states.has(200)).toBe(true)
    expect(log).toHaveBeenCalledWith(
      "awareness-spoof-dropped",
      expect.objectContaining({ userId: "mallory" })
    )
  })

  it("allows the same person to take over an id from their own stale connection", () => {
    const stale: FakeConnection = { context: ctx({ userId: "user-1" }) }
    const self: FakeConnection = { context: ctx({ userId: "user-1" }) }
    const { run } = setup(
      new Map([
        [stale, [100]],
        [self, []],
      ]),
      self
    )
    expect(run(new Map([[100, { cursor: null }]])).states.has(100)).toBe(true)
  })

  it("lets a connection own one awareness client only", () => {
    const self: FakeConnection = { context: ctx() }
    const { run } = setup(new Map([[self, [100]]]), self)
    const { states } = run(
      new Map([
        [100, { cursor: null }],
        [101, { cursor: null }],
      ])
    )
    expect([...states.keys()]).toEqual([100])
  })

  it("keeps only the first of several new clients in a first update", () => {
    const { run } = fresh()
    const { states } = run(
      new Map([
        [5, { cursor: null }],
        [6, { cursor: null }],
      ])
    )
    expect([...states.keys()]).toEqual([5])
  })

  it("lets a connection remove its own presence", () => {
    const self: FakeConnection = { context: ctx() }
    const { run } = setup(new Map([[self, [100]]]), self)
    expect(run(new Map(), [100]).removedClients.has(100)).toBe(true)
  })
})

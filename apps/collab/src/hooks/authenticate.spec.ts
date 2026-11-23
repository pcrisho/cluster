import { CollabApiError } from "../api-client"
import type { CollabSession } from "../types"
import { createAuthenticate } from "./authenticate"

const NAME = "know.page:00000000-0000-4000-8000-000000000001"
const session = (mode: CollabSession["mode"]): CollabSession => ({
  userId: "user-1",
  orgId: "org-1",
  name: "Ana Pérez",
  avatarUrl: null,
  color: "#e6194b",
  mode,
})

const setup = (authorize: jest.Mock) => {
  const log = jest.fn()
  const hook = createAuthenticate({ authorize }, log)
  const payload = (over: Record<string, unknown> = {}) =>
    ({
      token: "secret-jwt",
      documentName: NAME,
      socketId: "socket-1",
      connectionConfig: { readOnly: false, isAuthenticated: false },
      ...over,
    }) as never
  return { hook, log, payload }
}

const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return (error as { reason?: string }).reason
  }
  throw new Error("expected the hook to reject")
}

describe("authenticate hook", () => {
  it("opens a WRITE session and returns the server-side identity as the connection context", async () => {
    const authorize = jest.fn().mockResolvedValue(session("WRITE"))
    const { hook, payload } = setup(authorize)
    const p = payload()
    const context = await hook(p)
    expect(authorize).toHaveBeenCalledWith("secret-jwt", NAME)
    expect(context).toEqual(session("WRITE"))
    expect(
      (p as { connectionConfig: { readOnly: boolean } }).connectionConfig
        .readOnly
    ).toBe(false)
  })

  it("marks the connection read-only for a READ session", async () => {
    const { hook, payload } = setup(
      jest.fn().mockResolvedValue(session("READ"))
    )
    const p = payload()
    await hook(p)
    expect(
      (p as { connectionConfig: { readOnly: boolean } }).connectionConfig
        .readOnly
    ).toBe(true)
  })

  it.each(["unauthorized", "forbidden", "not_found", "bad_request"] as const)(
    "answers %s exactly like any other denial, so nobody can tell a missing document from a forbidden one",
    async (kind) => {
      const { hook, payload } = setup(
        jest.fn().mockRejectedValue(new CollabApiError(kind, 404, "x"))
      )
      expect(await reasonOf(hook(payload()))).toBe("permission-denied")
    }
  )

  it("tells the client to retry when the API is unavailable, and also on unexpected failures", async () => {
    const down = setup(
      jest
        .fn()
        .mockRejectedValue(new CollabApiError("unavailable", undefined, "down"))
    )
    expect(await reasonOf(down.hook(down.payload()))).toBe("unavailable")
    const bug = setup(jest.fn().mockRejectedValue(new TypeError("boom")))
    expect(await reasonOf(bug.hook(bug.payload()))).toBe("unavailable")
  })

  it("denies a malformed documentName without calling the API", async () => {
    const authorize = jest.fn()
    const { hook, payload } = setup(authorize)
    expect(
      await reasonOf(hook(payload({ documentName: "../etc/passwd" })))
    ).toBe("permission-denied")
    expect(authorize).not.toHaveBeenCalled()
  })

  it("denies an empty or missing token without calling the API", async () => {
    const authorize = jest.fn()
    const { hook, payload } = setup(authorize)
    expect(await reasonOf(hook(payload({ token: "" })))).toBe(
      "permission-denied"
    )
    expect(await reasonOf(hook(payload({ token: undefined })))).toBe(
      "permission-denied"
    )
    expect(authorize).not.toHaveBeenCalled()
  })

  it("logs the denial with document and socket, never the token", async () => {
    const { hook, log, payload } = setup(
      jest.fn().mockRejectedValue(new CollabApiError("forbidden", 403, "x"))
    )
    await reasonOf(hook(payload()))
    expect(log).toHaveBeenCalledWith(
      "auth-denied",
      expect.objectContaining({ documentName: NAME, socketId: "socket-1" })
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-jwt")
  })
})

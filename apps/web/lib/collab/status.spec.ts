import { describeStatus } from "./status"
import type { CollabStatus } from "./collab-session"

const all: CollabStatus[] = [
  "connecting",
  "connected",
  "readonly",
  "disconnected",
  "denied",
  "unavailable",
  "deleted",
]

describe("describeStatus", () => {
  it("names each state, with both ways of losing the server as offline", () => {
    expect(describeStatus("connected")).toEqual({
      label: "connected",
      tone: "ok",
    })
    expect(describeStatus("readonly").label).toBe("readonly")
    expect(describeStatus("deleted")).toEqual({
      label: "deleted",
      tone: "warn",
    })
    expect(describeStatus("denied")).toEqual({ label: "denied", tone: "warn" })
    for (const s of ["disconnected", "unavailable"] as const)
      expect(describeStatus(s)).toEqual({ label: "offline", tone: "warn" })
  })

  it("has a label for every status", () => {
    for (const s of all) expect(describeStatus(s).label).not.toBe("")
  })
})

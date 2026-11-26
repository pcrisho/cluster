import { resolveAssignment } from "./assignment-drop"

const lead = { id: "p1", name: "Backend Lead" }
const scope: Record<string, string | null> = { p1: "eng", global: null }
const area = (id: string) => scope[id] ?? null

describe("resolveAssignment", () => {
  it("does nothing when the person is already there", () => {
    expect(
      resolveAssignment({ orgNodeId: "eng", position: lead }, "eng", area)
    ).toEqual({ kind: "same" })
    expect(
      resolveAssignment({ orgNodeId: null, position: null }, null, area)
    ).toEqual({ kind: "same" })
  })

  it("moves a person with no position, or a global one, keeping the position", () => {
    expect(
      resolveAssignment({ orgNodeId: "eng", position: null }, "ops", area)
    ).toEqual({
      kind: "ok",
      plan: { orgNodeId: "ops", clearedPosition: null },
    })
    expect(
      resolveAssignment(
        { orgNodeId: "eng", position: { id: "global", name: "Analyst" } },
        "ops",
        area
      )
    ).toMatchObject({ plan: { clearedPosition: null } })
  })

  it("drops a position that belongs to the area being left", () => {
    expect(
      resolveAssignment({ orgNodeId: "eng", position: lead }, "ops", area)
    ).toEqual({
      kind: "ok",
      plan: { orgNodeId: "ops", clearedPosition: lead },
    })
  })

  it("keeps a position that belongs to the target area", () => {
    expect(
      resolveAssignment({ orgNodeId: null, position: lead }, "eng", area)
    ).toMatchObject({
      plan: { orgNodeId: "eng", clearedPosition: null },
    })
  })

  it("takes the position along when leaving every area", () => {
    expect(
      resolveAssignment(
        { orgNodeId: "eng", position: { id: "global", name: "Analyst" } },
        null,
        area
      )
    ).toEqual({
      kind: "ok",
      plan: {
        orgNodeId: null,
        clearedPosition: { id: "global", name: "Analyst" },
      },
    })
  })
})

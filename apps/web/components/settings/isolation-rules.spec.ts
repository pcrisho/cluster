import { isolationBlock } from "./isolation-rules"

describe("isolationBlock", () => {
  it("blocks while the instance does not allow isolation", () => {
    expect(isolationBlock({ allowed: false }, ["KNOW", "GROW"])).toBe(
      "instance"
    )
  })

  it("blocks while CONNECT or LIFE is enabled in the organization", () => {
    expect(isolationBlock({ allowed: true }, ["KNOW", "CONNECT"])).toBe(
      "modules"
    )
    expect(isolationBlock({ allowed: true }, ["LIFE"])).toBe("modules")
  })

  it("allows KNOW and GROW alone, and the instance reason comes first", () => {
    expect(isolationBlock({ allowed: true }, ["KNOW", "GROW"])).toBeNull()
    expect(isolationBlock({ allowed: false }, ["CONNECT"])).toBe("instance")
  })
})

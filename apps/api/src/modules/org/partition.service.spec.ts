import { PartitionService } from "./partition.service"

describe("PartitionService.peopleFilter", () => {
  const service = new PartitionService(null as never)

  it("filters nothing for the whole organization", () => {
    expect(service.peopleFilter({ all: true })).toEqual({})
  })

  it("keeps people whose profile node is in scope", () => {
    expect(service.peopleFilter({ all: false, nodeIds: new Set(["a", "a1"]) })).toEqual({
      profile: { orgNodeId: { in: ["a", "a1"] } },
    })
  })

  it("matches nobody for an empty scope", () => {
    expect(service.peopleFilter({ all: false, nodeIds: new Set() })).toEqual({
      profile: { orgNodeId: { in: [] } },
    })
  })
})

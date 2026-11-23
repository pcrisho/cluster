import { peopleMovingPartition, type FlatArea } from "./partition-moves"

// Main node A (3 people in A1, 2 in A2, 1 in A itself, A3 empty) and main node B (4 people in B1).
const nodes: FlatArea[] = [
  { id: "a", parentId: null, name: "A", _count: { profiles: 1 } },
  { id: "a1", parentId: "a", name: "A1", _count: { profiles: 3 } },
  { id: "a2", parentId: "a", name: "A2", _count: { profiles: 2 } },
  { id: "a3", parentId: "a", name: "A3", _count: { profiles: 0 } },
  { id: "b", parentId: null, name: "B", _count: { profiles: 0 } },
  { id: "b1", parentId: "b", name: "B1", _count: { profiles: 4 } },
]

describe("peopleMovingPartition", () => {
  it("returns nothing when the organization is not isolated", () => {
    expect(
      peopleMovingPartition(
        nodes,
        { kind: "area", nodeId: "a1", newParentId: "b1" },
        false
      )
    ).toBeNull()
  })

  describe("areas", () => {
    it("counts the whole subtree when an area moves to another main node", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "area", nodeId: "a1", newParentId: "b1" },
          true
        )
      ).toEqual({ count: 3, targetMainNodeName: "B" })
    })

    it("returns nothing for a move inside the same main node", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "area", nodeId: "a1", newParentId: "a2" },
          true
        )
      ).toBeNull()
    })

    it("counts the main node's own subtree when a main node goes under another", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "area", nodeId: "a", newParentId: "b1" },
          true
        )
      ).toEqual({ count: 6, targetMainNodeName: "B" })
    })

    it("makes a sub-area a main node when it moves to the top level", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "area", nodeId: "a1", newParentId: null },
          true
        )
      ).toEqual({ count: 3, targetMainNodeName: "A1" })
    })

    it("returns nothing when nobody is below the area", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "area", nodeId: "a3", newParentId: "b" },
          true
        )
      ).toBeNull()
    })
  })

  describe("people", () => {
    it("counts one person moving to another main node", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "person", fromNodeId: "a1", toNodeId: "b1" },
          true
        )
      ).toEqual({ count: 1, targetMainNodeName: "B" })
    })

    it("returns nothing for a person moving within the same main node", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "person", fromNodeId: "a1", toNodeId: "a2" },
          true
        )
      ).toBeNull()
    })

    it("returns nothing for a person with no node moving to no node", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "person", fromNodeId: null, toNodeId: null },
          true
        )
      ).toBeNull()
    })

    it("counts a person with no node who gets one, and one who loses theirs", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "person", fromNodeId: null, toNodeId: "a1" },
          true
        )
      ).toEqual({ count: 1, targetMainNodeName: "A" })
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "person", fromNodeId: "b1", toNodeId: null },
          true
        )
      ).toEqual({ count: 1, targetMainNodeName: null })
    })
  })

  describe("archive", () => {
    it("counts the people reassigned to another main node", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "archive", nodeId: "a2", reassignTo: "b1" },
          true
        )
      ).toEqual({ count: 2, targetMainNodeName: "B" })
    })

    it("returns nothing when the people stay in their main node or there are none", () => {
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "archive", nodeId: "a2", reassignTo: "a1" },
          true
        )
      ).toBeNull()
      expect(
        peopleMovingPartition(
          nodes,
          { kind: "archive", nodeId: "a3", reassignTo: "b1" },
          true
        )
      ).toBeNull()
    })
  })
})

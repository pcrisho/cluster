import { complianceByMainNode } from "./report-main-nodes";

describe("complianceByMainNode", () => {
  const parentOf = new Map<string, string | null>([
    ["root-a", null],
    ["child-a1", "root-a"],
    ["grandchild-a1", "child-a1"],
    ["root-b", null],
    ["root-c", null],
    ["other-root", null],
  ]);

  it("rolls up child and grandchild sub-areas into their main node and rounds rate like dashboardOf", () => {
    const result = complianceByMainNode(
      [
        { area: { id: "root-a" }, state: "COMPLETED" },
        { area: { id: "child-a1" }, state: "OVERDUE" },
        { area: { id: "grandchild-a1" }, state: "IN_PROGRESS" },
        { area: { id: "root-b" }, state: "NOT_STARTED" },
        { area: { id: "root-b" }, state: "COMPLETED" },
        { area: null, state: "COMPLETED" },
        { area: { id: "other-root" }, state: "OVERDUE" },
      ],
      ["root-a", "root-b", "root-c"],
      parentOf,
    );

    expect(result).toEqual([
      {
        mainNodeId: "root-a",
        total: 3,
        completed: 1,
        overdue: 1,
        inProgress: 1,
        notStarted: 0,
        rate: 33,
      },
      {
        mainNodeId: "root-b",
        total: 2,
        completed: 1,
        overdue: 0,
        inProgress: 0,
        notStarted: 1,
        rate: 50,
      },
      {
        mainNodeId: "root-c",
        total: 0,
        completed: 0,
        overdue: 0,
        inProgress: 0,
        notStarted: 0,
        rate: null,
      },
    ]);
  });
});

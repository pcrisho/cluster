import {
  byUrgency,
  derivedState,
  effectiveDue,
  usersReachedBy,
  type AssignmentTarget,
} from "./assignment-resolution";

const at = (iso: string) => new Date(iso);
const target = (patch: Partial<AssignmentTarget>): AssignmentTarget => ({
  mandatory: true,
  dueAt: null,
  dueInDays: null,
  createdAt: at("2026-10-01T12:00:00Z"),
  userId: null,
  orgNodeId: null,
  positionId: null,
  ...patch,
});
// ops > ops-north > ops-north-1 ; sales
const parentOf = new Map<string, string | null>([
  ["ops", null],
  ["ops-north", "ops"],
  ["ops-north-1", "ops-north"],
  ["sales", null],
]);
const members = [
  { userId: "ana", orgNodeId: "ops", positionId: null },
  { userId: "ben", orgNodeId: "ops-north-1", positionId: "driver" },
  { userId: "cy", orgNodeId: "sales", positionId: "driver" },
  { userId: "dee", orgNodeId: null, positionId: null },
];

describe("usersReachedBy", () => {
  it("an area reaches its sub-areas, not its parents or siblings", () => {
    expect(
      usersReachedBy(target({ orgNodeId: "ops-north" }), members, parentOf),
    ).toEqual(["ben"]);
    expect(
      usersReachedBy(target({ orgNodeId: "ops" }), members, parentOf),
    ).toEqual(["ana", "ben"]);
  });

  it("a position reaches everyone holding it; a person only that person", () => {
    expect(
      usersReachedBy(target({ positionId: "driver" }), members, parentOf),
    ).toEqual(["ben", "cy"]);
    expect(
      usersReachedBy(target({ userId: "dee" }), members, parentOf),
    ).toEqual(["dee"]);
    expect(
      usersReachedBy(target({ userId: "gone" }), members, parentOf),
    ).toEqual([]);
  });
});

describe("effectiveDue", () => {
  it("mandatory beats optional and the earliest mandatory due date wins", () => {
    const result = effectiveDue(
      [
        target({ mandatory: false, dueAt: at("2026-10-05T00:00:00Z") }),
        target({ dueAt: at("2026-11-30T00:00:00Z") }),
        target({ dueInDays: 10 }),
      ],
      null,
      "UTC",
    );
    expect(result).toEqual({
      mandatory: true,
      dueAt: "2026-10-11",
      since: at("2026-10-01T12:00:00Z"),
    });
  });

  it("optional only is not required; mandatory without dates has no due date", () => {
    expect(effectiveDue([target({ mandatory: false })], null, "UTC")).toEqual({
      mandatory: false,
      dueAt: null,
      since: null,
    });
    expect(effectiveDue([target({})], null, "UTC").dueAt).toBeNull();
  });

  it("a later move into the area moves the relative due date and the New anchor", () => {
    const moved = at("2026-10-20T08:00:00Z");
    expect(
      effectiveDue([target({ orgNodeId: "ops", dueInDays: 5 })], moved, "UTC"),
    ).toEqual({
      mandatory: true,
      dueAt: "2026-10-25",
      since: moved,
    });
  });
});

describe("derivedState", () => {
  const today = "2026-10-26";
  it.each([
    [null, null, "NOT_STARTED"],
    ["IN_PROGRESS", "2026-10-26", "IN_PROGRESS"],
    ["IN_PROGRESS", "2026-10-25", "OVERDUE"],
    [null, "2026-10-25", "OVERDUE"],
    ["COMPLETED", "2026-10-01", "COMPLETED"],
  ] as const)("%s due %s → %s", (enrollment, dueAt, expected) => {
    expect(derivedState({ enrollment, dueAt, today })).toBe(expected);
  });
});

describe("byUrgency", () => {
  it("orders overdue, then due soonest, in progress, not started, completed", () => {
    const items = [
      { title: "done", state: "COMPLETED", dueAt: "2026-01-01" },
      { title: "fresh", state: "NOT_STARTED", dueAt: null },
      { title: "going", state: "IN_PROGRESS", dueAt: null },
      { title: "later", state: "NOT_STARTED", dueAt: "2026-12-01" },
      { title: "soon", state: "IN_PROGRESS", dueAt: "2026-11-01" },
      { title: "late", state: "OVERDUE", dueAt: "2026-10-01" },
      { title: "later still late", state: "OVERDUE", dueAt: "2026-10-20" },
    ] as const;
    expect([...items].sort(byUrgency).map((i) => i.title)).toEqual([
      "late",
      "later still late",
      "soon",
      "later",
      "going",
      "fresh",
      "done",
    ]);
  });
});

import { addDays, anchorOf, dueFor, todayIn } from "./due-date";

const at = (iso: string) => new Date(iso);
const rule = (patch: Partial<Parameters<typeof dueFor>[0]> = {}) => ({
  dueAt: null,
  dueInDays: null,
  createdAt: at("2026-10-01T15:00:00Z"),
  userId: null,
  ...patch,
});

describe("todayIn", () => {
  it("Lima at 23:00 (UTC-5) is still the same day while UTC already moved on", () => {
    const now = at("2026-10-27T04:00:00Z"); // 23:00 on the 26th in Lima
    expect(todayIn("America/Lima", now)).toBe("2026-10-26");
    expect(todayIn("UTC", now)).toBe("2026-10-27");
  });
});

describe("addDays", () => {
  it("crosses months and leap days", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("dueFor", () => {
  it("absolute only, relative only, neither", () => {
    expect(
      dueFor(rule({ dueAt: at("2026-11-30T00:00:00Z") }), null, "UTC"),
    ).toBe("2026-11-30");
    expect(dueFor(rule({ dueInDays: 30 }), null, "UTC")).toBe("2026-10-31");
    expect(dueFor(rule(), null, "UTC")).toBeNull();
  });

  it("with both, the later one wins", () => {
    const both = rule({ dueAt: at("2026-10-15T00:00:00Z"), dueInDays: 30 });
    expect(dueFor(both, null, "UTC")).toBe("2026-10-31");
    expect(
      dueFor({ ...both, dueAt: at("2026-12-01T00:00:00Z") }, null, "UTC"),
    ).toBe("2026-12-01");
  });

  it("counts from the move into the area when it is after the assignment", () => {
    const moved = at("2026-10-20T12:00:00Z");
    expect(dueFor(rule({ dueInDays: 10 }), moved, "UTC")).toBe("2026-10-30");
    // an earlier move does not pull the anchor back
    expect(
      dueFor(rule({ dueInDays: 10 }), at("2026-09-01T00:00:00Z"), "UTC"),
    ).toBe("2026-10-11");
    // a person assignment always counts from its creation
    expect(dueFor(rule({ dueInDays: 10, userId: "u1" }), moved, "UTC")).toBe(
      "2026-10-11",
    );
  });

  it("takes the anchor's date in the organization's timezone", () => {
    const late = rule({ dueInDays: 1, createdAt: at("2026-10-01T03:00:00Z") }); // 22:00 on Sep 30 in Lima
    expect(dueFor(late, null, "America/Lima")).toBe("2026-10-01");
    expect(dueFor(late, null, "UTC")).toBe("2026-10-02");
  });

  it("anchorOf picks the later instant for area and position assignments", () => {
    const moved = at("2026-10-20T12:00:00Z");
    expect(anchorOf(rule(), moved)).toEqual(moved);
    expect(anchorOf(rule({ userId: "u" }), moved)).toEqual(rule().createdAt);
  });
});

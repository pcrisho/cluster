import { reportScope } from "./report-scope";

const parentOf = new Map<string, string | null>([
  ["root", null],
  ["ops", "root"],
  ["ops-night", "ops"],
  ["sales", "root"],
]);
const user = (role: string, capabilities: string[] = []) => ({
  role,
  capabilities,
});

describe("reportScope", () => {
  it("ADMIN, tenant MANAGER and course managers see the whole organization", () => {
    for (const u of [
      user("ADMIN"),
      user("MANAGER"),
      user("COLLABORATOR", ["GROW_COURSE_MANAGE"]),
    ])
      expect(reportScope(u, [], parentOf)).toEqual({ all: true });
  });

  it("an area manager sees their areas and every area below them", () => {
    const scope = reportScope(user("COLLABORATOR"), ["ops"], parentOf);
    expect(scope).toEqual({ all: false, nodeIds: expect.any(Set) });
    if (scope?.all !== false) throw new Error("unexpected");
    expect([...scope.nodeIds].sort()).toEqual(["ops", "ops-night"]);
  });

  it("anyone else gets no reports", () => {
    expect(reportScope(user("COLLABORATOR"), [], parentOf)).toBeNull();
  });
});

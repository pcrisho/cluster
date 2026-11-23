import { rlsProblems, systemRoleProblems } from "./rls-self-check";

const ok = (name: string) => ({
  name,
  rls: true,
  hasPolicy: true,
  ownerMember: false,
});
const role = { name: "cluster_app", privileged: false };

describe("rlsProblems", () => {
  it("accepts an unprivileged role and tables with RLS and a policy", () => {
    expect(rlsProblems(role, ["a", "b"], [ok("a"), ok("b")])).toEqual([]);
  });

  it("refuses a superuser or BYPASSRLS role", () => {
    const problems = rlsProblems(
      { name: "postgres", privileged: true },
      ["a"],
      [ok("a")],
    );
    expect(problems).toEqual([
      expect.stringContaining("postgres is a superuser or has BYPASSRLS"),
    ]);
  });

  it("refuses RLS off, no policy, and an owner or owner member, one problem each", () => {
    const problems = rlsProblems(
      role,
      ["off", "bare", "owned"],
      [
        { ...ok("off"), rls: false },
        { ...ok("bare"), hasPolicy: false },
        { ...ok("owned"), ownerMember: true },
      ],
    );
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('"off"');
    expect(problems[1]).toContain('"bare"');
    expect(problems[2]).toContain('"owned"');
  });

  it("refuses a tenant table the query did not find", () => {
    expect(rlsProblems(role, ["a", "gone"], [ok("a")])).toEqual([
      expect.stringContaining('"gone"'),
    ]);
  });
});

describe("systemRoleProblems", () => {
  const sys = {
    name: "cluster_system",
    superuser: false,
    bypassRls: true,
    ownedTables: [],
  };

  it("accepts a DML-only role with BYPASSRLS that owns nothing", () => {
    expect(systemRoleProblems(sys)).toEqual([]);
  });

  it("refuses a superuser, a role without BYPASSRLS and an owner, one problem each", () => {
    expect(systemRoleProblems({ ...sys, superuser: true })).toHaveLength(1);
    expect(systemRoleProblems({ ...sys, bypassRls: false })).toHaveLength(1);
    expect(systemRoleProblems({ ...sys, ownedTables: ["users"] })).toEqual([
      expect.stringContaining('"users"'),
    ]);
  });
});

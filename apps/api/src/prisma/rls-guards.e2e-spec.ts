import { withOrg } from "../common/request-context";
import { PrismaService } from "./prisma.service";
import { SystemPrismaService } from "./system-prisma.service";

/** Static guards on the schema: a new table or a dropped policy, grant or trigger fails here. */
describe("row-level security guards on the schema", () => {
  const system = new SystemPrismaService();
  const app = new PrismaService();

  const tenantTables = async () =>
    (
      await system.$queryRaw<{ name: string }[]>`
        SELECT c.relname AS name
        FROM pg_attribute at
        JOIN pg_class c ON c.oid = at.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE at.attname = 'organizationId' AND n.nspname = 'public' AND c.relkind = 'r' AND NOT at.attisdropped`
    )
      .map((r) => r.name)
      .concat("Organization")
      .sort();

  beforeAll(() => app.onModuleInit());
  afterAll(async () => {
    await app.onModuleDestroy();
    await system.$disconnect();
  });

  it("has row-level security and a policy on every tenant table", async () => {
    const tables = await tenantTables();
    expect(tables.length).toBeGreaterThanOrEqual(28);
    const rows = await system.$queryRaw<
      { name: string; rls: boolean; policies: number }[]
    >`
      SELECT c.relname AS name, c.relrowsecurity AS rls,
        (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${tables})`;
    expect(rows.length).toBe(tables.length);
    expect(
      rows.filter((r) => !r.rls || r.policies < 1).map((r) => r.name),
    ).toEqual([]);
  });

  /** Tables the app role must not touch at all: migrations and authentication state (docs/specs/auth/hardening). */
  const NO_APP_ACCESS = [
    "_prisma_migrations",
    "auth_challenges",
    "auth_events",
    "auth_sessions",
    "login_throttle",
    "mfa_recovery_codes",
    "password_links",
    "user_mfa",
  ];

  it("grants cluster_app DML on every table except the closed no-access list, which gets nothing", async () => {
    const rows = await system.$queryRaw<
      { name: string; privileges: string[] }[]
    >`
      SELECT c.relname AS name,
        array_remove(ARRAY[
          CASE WHEN has_table_privilege('cluster_app', c.oid, 'SELECT') THEN 'SELECT' END,
          CASE WHEN has_table_privilege('cluster_app', c.oid, 'INSERT') THEN 'INSERT' END,
          CASE WHEN has_table_privilege('cluster_app', c.oid, 'UPDATE') THEN 'UPDATE' END,
          CASE WHEN has_table_privilege('cluster_app', c.oid, 'DELETE') THEN 'DELETE' END
        ], NULL) AS privileges
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThan(28);
    const wrong = rows.filter((r) =>
      NO_APP_ACCESS.includes(r.name)
        ? r.privileges.length > 0
        : r.privileges.join() !== "SELECT,INSERT,UPDATE,DELETE",
    );
    expect(wrong).toEqual([]);
    expect(
      rows
        .filter((r) => NO_APP_ACCESS.includes(r.name))
        .map((r) => r.name)
        .sort(),
    ).toEqual(NO_APP_ACCESS);
  });

  it("makes the system client a DML-only role that bypasses RLS and owns nothing", async () => {
    const [role] = await system.$queryRaw<
      {
        name: string;
        super: boolean;
        bypass: boolean;
        createdb: boolean;
        createrole: boolean;
      }[]
    >`
      SELECT rolname AS name, rolsuper AS super, rolbypassrls AS bypass,
             rolcreatedb AS createdb, rolcreaterole AS createrole
        FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({
      name: "cluster_system",
      super: false,
      bypass: true,
      createdb: false,
      createrole: false,
    });
    const owned = await system.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND pg_has_role(current_user, c.relowner, 'USAGE')`;
    expect(owned).toEqual([]);
  });

  it("grants the system role DML on every table but _prisma_migrations, and no DDL", async () => {
    const rows = await system.$queryRaw<
      { name: string; privileges: string[] }[]
    >`
      SELECT c.relname AS name,
        array_remove(ARRAY[
          CASE WHEN has_table_privilege(c.oid, 'SELECT') THEN 'SELECT' END,
          CASE WHEN has_table_privilege(c.oid, 'INSERT') THEN 'INSERT' END,
          CASE WHEN has_table_privilege(c.oid, 'UPDATE') THEN 'UPDATE' END,
          CASE WHEN has_table_privilege(c.oid, 'DELETE') THEN 'DELETE' END,
          CASE WHEN has_table_privilege(c.oid, 'TRUNCATE') THEN 'TRUNCATE' END
        ], NULL) AS privileges
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`;
    const wrong = rows.filter((r) =>
      r.name === "_prisma_migrations"
        ? r.privileges.length > 0
        : r.privileges.join() !== "SELECT,INSERT,UPDATE,DELETE",
    );
    expect(wrong).toEqual([]);
    expect(rows.map((r) => r.name)).toContain("_prisma_migrations");
    await expect(
      system.$executeRawUnsafe(`CREATE TABLE rls_guard_ddl (id int)`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      system.$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`,
    ).rejects.toThrow(/permission denied/);
  });

  it("lets the system role read and write an auth table the app role cannot touch", async () => {
    await expect(
      system.$queryRaw`SELECT count(*) FROM auth_sessions`,
    ).resolves.toBeDefined();
    await expect(
      system.$executeRaw`DELETE FROM auth_sessions WHERE false`,
    ).resolves.toBe(0);
  });

  it("refuses the app role a read of the session table", async () => {
    // Any organization: the context only gets the query past the pool, the grant is what refuses it.
    await expect(
      withOrg(
        "00000000-0000-0000-0000-000000000000",
        async () => await app.$queryRaw`SELECT 1 FROM auth_sessions LIMIT 1`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("puts the org_from_parent trigger on each of the 19 child tables", async () => {
    const children = await system.$queryRaw<
      { name: string; triggers: number }[]
    >`
      SELECT c.relname AS name,
        (SELECT count(*)::int FROM pg_trigger t
          WHERE t.tgrelid = c.oid AND NOT t.tgisinternal AND t.tgname = 'org_from_parent') AS triggers
      FROM pg_attribute at
      JOIN pg_class c ON c.oid = at.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attrdef d ON d.adrelid = at.attrelid AND d.adnum = at.attnum
      WHERE at.attname = 'organizationId' AND n.nspname = 'public' AND c.relkind = 'r'
        AND pg_get_expr(d.adbin, d.adrelid) LIKE '%app_org_id()%'`;
    expect(children.length).toBe(19);
    expect(children.filter((c) => c.triggers !== 1).map((c) => c.name)).toEqual(
      [],
    );
  });

  describe("a child under another organization's parent", () => {
    let a: { id: string; userId: string };
    let b: { id: string; spaceId: string };
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    beforeAll(async () => {
      const mk = async (label: string) => {
        const slug = `guard-${label}-${stamp}`;
        const org = await system.organization.create({
          data: { name: slug, slug },
        });
        const user = await system.user.create({
          data: {
            email: `${slug}@x.com`,
            passwordHash: "x",
            firstName: label,
            lastName: "G",
            organizationId: org.id,
          },
        });
        const space = await system.space.create({
          data: { name: slug, createdBy: user.id, organizationId: org.id },
        });
        return { id: org.id, userId: user.id, spaceId: space.id };
      };
      a = await mk("a");
      b = await mk("b");
    });

    it("is rejected on the ordinary client under A", async () => {
      await expect(
        withOrg(a.id, async () =>
          app.page.create({
            data: { title: "x", spaceId: b.spaceId, authorId: a.userId },
          }),
        ),
      ).rejects.toThrow();
      expect(await system.page.count({ where: { spaceId: b.spaceId } })).toBe(
        0,
      );
    });

    it("is rejected on the system client with A's organization and B's parent", async () => {
      await expect(
        system.$executeRaw`INSERT INTO pages ("id", "title", "spaceId", "authorId", "organizationId", "updatedAt")
          VALUES (gen_random_uuid()::text, 'x', ${b.spaceId}, ${a.userId}, ${a.id}, now())`,
      ).rejects.toThrow(/organization differs from its spaces/);
      expect(await system.page.count({ where: { spaceId: b.spaceId } })).toBe(
        0,
      );
    });
  });
});

import { Logger } from "@nestjs/common";
import { Client } from "pg";

export interface RoleRow {
  name: string;
  /** Superuser or BYPASSRLS: policies do not apply to it. */
  privileged: boolean;
}

export interface TableRow {
  name: string;
  rls: boolean;
  hasPolicy: boolean;
  /** Owner of the table, or a member of its owner (Postgres skips RLS for both). */
  ownerMember: boolean;
}

/** Everything that would switch the wall off, one line each; empty when the setup is safe. */
export function rlsProblems(
  role: RoleRow,
  expected: string[],
  tables: TableRow[],
): string[] {
  const problems: string[] = [];
  if (role.privileged)
    problems.push(`role ${role.name} is a superuser or has BYPASSRLS`);
  for (const name of expected) {
    const t = tables.find((row) => row.name === name);
    if (!t) problems.push(`table "${name}" was not found`);
    else if (!t.rls)
      problems.push(`table "${name}" has row-level security off`);
    else if (!t.hasPolicy) problems.push(`table "${name}" has no policy`);
    else if (t.ownerMember)
      problems.push(
        `role ${role.name} owns table "${name}" or is a member of its owner`,
      );
  }
  return problems;
}

/** Refuses to continue when `databaseUrl`'s role could read across organizations. Opens its own connection: no request context needed. */
export async function assertRlsSelfCheck(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows: roles } = await client.query<RoleRow>(
      `SELECT rolname AS name, rolsuper OR rolbypassrls AS privileged
         FROM pg_roles WHERE rolname = current_user`,
    );
    // Read from pg_attribute, not information_schema: that one hides tables the role has no grant on.
    const { rows: found } = await client.query<{ name: string }>(
      `SELECT c.relname AS name
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND a.attname = 'organizationId' AND NOT a.attisdropped`,
    );
    const expected = [...found.map((r) => r.name), "Organization"];
    const { rows: tables } = await client.query<TableRow>(
      `SELECT c.relname AS name,
              c.relrowsecurity AS rls,
              EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS "hasPolicy",
              pg_has_role(current_user, c.relowner, 'USAGE') AS "ownerMember"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
      [expected],
    );
    const problems = rlsProblems(roles[0], expected, tables);
    if (problems.length)
      throw new Error(
        `Refusing to start, row-level security is not safe:\n- ${problems.join("\n- ")}`,
      );
    new Logger("Database").log(
      `Database role: ${roles[0].name} (RLS on ${tables.length} tables)`,
    );
  } finally {
    await client.end();
  }
}

export interface SystemRoleRow {
  name: string;
  superuser: boolean;
  bypassRls: boolean;
  /** Public tables it owns or whose owner it is a member of. */
  ownedTables: string[];
}

/** What would make the system role more than a DML-only role that bypasses RLS; empty when safe. */
export function systemRoleProblems(role: SystemRoleRow): string[] {
  const problems: string[] = [];
  if (role.superuser) problems.push(`role ${role.name} is a superuser`);
  if (!role.bypassRls)
    problems.push(
      `role ${role.name} lacks BYPASSRLS (auth and instance reads would find nothing)`,
    );
  if (role.ownedTables.length)
    problems.push(
      `role ${role.name} owns, or is a member of the owner of, ${role.ownedTables.map((t) => `"${t}"`).join(", ")}`,
    );
  return problems;
}

/** Refuses to continue when the system client's role is the owner, a superuser or lacks BYPASSRLS. */
export async function assertSystemRoleSelfCheck(
  systemUrl: string,
): Promise<void> {
  const client = new Client({ connectionString: systemUrl });
  await client.connect();
  try {
    const { rows } = await client.query<SystemRoleRow>(
      `SELECT r.rolname AS name, r.rolsuper AS superuser, r.rolbypassrls AS "bypassRls",
              COALESCE((SELECT array_agg(c.relname::text) FROM pg_class c
                         JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'S')
                          AND pg_has_role(r.oid, c.relowner, 'USAGE')), '{}') AS "ownedTables"
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const problems = systemRoleProblems(rows[0]);
    if (problems.length)
      throw new Error(
        `Refusing to start, the system database role is not safe:\n- ${problems.join("\n- ")}`,
      );
    new Logger("Database").log(`System database role: ${rows[0].name}`);
  } finally {
    await client.end();
  }
}

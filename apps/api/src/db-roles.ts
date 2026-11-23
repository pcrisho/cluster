import { Client } from "pg";

export const APP_ROLE = "cluster_app";
export const SYSTEM_ROLE = "cluster_system";

/** User and password of a role's URL; the role's name is fixed because the migrations grant to it. */
function parseRoleUrl(
  raw: string | undefined,
  envName: string,
  role: string,
): { user: string; password: string } {
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    throw new Error(`${envName} is missing or is not a valid URL`);
  }
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (user !== role) throw new Error(`${envName} must use the ${role} role`);
  if (!password) throw new Error(`${envName} has no password for ${role}`);
  return { user, password };
}

export const parseAppUrl = (appUrl: string | undefined) =>
  parseRoleUrl(appUrl, "DATABASE_URL", APP_ROLE);
export const parseSystemUrl = (systemUrl: string | undefined) =>
  parseRoleUrl(systemUrl, "DATABASE_SYSTEM_URL", SYSTEM_ROLE);

/**
 * Creates the app and system roles, or resets their login and passwords to the ones in their URLs. Run before
 * `migrate deploy`. Granting BYPASSRLS to the system role needs a superuser (or the provider's equivalent).
 */
export async function ensureRoles(
  ownerUrl: string,
  appUrl: string,
  systemUrl: string,
): Promise<void> {
  const roles = [
    { ...parseAppUrl(appUrl), attrs: "NOBYPASSRLS" },
    {
      ...parseSystemUrl(systemUrl),
      attrs: "NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS",
    },
  ];
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    for (const { user, password, attrs } of roles) {
      const exists = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = $1",
        [user],
      );
      const verb = exists.rowCount ? "ALTER" : "CREATE";
      // Passwords cannot be bind parameters in DDL: format('%L') quotes the literal on the server.
      const stmt = await client.query<{ sql: string }>(
        `SELECT format('${verb} ROLE %I LOGIN NOSUPERUSER ${attrs} PASSWORD %L', $1::text, $2::text) AS sql`,
        [user, password],
      );
      await client.query(stmt.rows[0].sql);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const { DATABASE_OWNER_URL, DATABASE_URL, DATABASE_SYSTEM_URL } = process.env;
  if (!DATABASE_OWNER_URL) {
    console.error("db-roles: DATABASE_OWNER_URL is missing");
    process.exit(1);
  }
  ensureRoles(DATABASE_OWNER_URL, DATABASE_URL ?? "", DATABASE_SYSTEM_URL ?? "")
    .then(() =>
      console.log(`db-roles: roles ${APP_ROLE} and ${SYSTEM_ROLE} ready`),
    )
    .catch((e: Error) => {
      console.error(`db-roles: ${e.message}`);
      process.exit(1);
    });
}

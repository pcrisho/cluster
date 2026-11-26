const MIN_SECRET_LENGTH = 32;
// "minioadmin": the storage keys' default in older .env files.
const KNOWN_DEFAULTS = new Set([
  "change-me-in-production",
  "cluster-storage",
  "cluster-storage-secret",
  "minioadmin",
]);
// Database passwords shipped in .env.example and docker-compose.yml.
const KNOWN_DB_PASSWORDS = new Set([
  "cluster",
  "cluster_app",
  "cluster_system",
]);

export interface ConfigReport {
  /** Settings that make the instance unsafe: the API refuses to start with them in production. */
  errors: string[];
  /** Settings worth fixing that a deployment may still have a reason for. */
  warnings: string[];
}

/**
 * Checks the security-relevant settings the API reads at runtime. Pure, so main.ts decides
 * what to do: fail in production, warn in development (where `.env.example` defaults are fine).
 */
export function checkStartupConfig(
  env: Record<string, string | undefined>,
): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const jwt = env.JWT_SECRET ?? "";
  if (KNOWN_DEFAULTS.has(jwt) || jwt.length < MIN_SECRET_LENGTH) {
    errors.push(
      `JWT_SECRET must be a random value of at least ${MIN_SECRET_LENGTH} characters ` +
        "(e.g. `openssl rand -hex 32`); it signs every session",
    );
  }

  const authKey = env.AUTH_SECRET_KEY ?? "";
  if (authKey.length < MIN_SECRET_LENGTH || authKey === jwt) {
    errors.push(
      `AUTH_SECRET_KEY must be a random value of at least ${MIN_SECRET_LENGTH} characters, other than ` +
        "JWT_SECRET (e.g. `openssl rand -hex 32`); it keys the lockout and protects 2FA secrets",
    );
  }

  const collabSecret = env.COLLAB_INTERNAL_SECRET ?? "";
  if (
    collabSecret.length < MIN_SECRET_LENGTH ||
    collabSecret === jwt ||
    collabSecret === authKey
  ) {
    errors.push(
      `COLLAB_INTERNAL_SECRET must be a random value of at least ${MIN_SECRET_LENGTH} characters, other than ` +
        "JWT_SECRET and AUTH_SECRET_KEY (e.g. `openssl rand -hex 32`); it guards the realtime service's internal routes",
    );
  }

  const databases: [string, string][] = [
    ["DATABASE_URL", "CLUSTER_APP_PASSWORD"],
    ["DATABASE_SYSTEM_URL", "CLUSTER_SYSTEM_PASSWORD"],
    ["DATABASE_OWNER_URL", "POSTGRES_PASSWORD"],
  ];
  for (const [url, passwordVar] of databases) {
    if (KNOWN_DB_PASSWORDS.has(databasePassword(env[url]))) {
      errors.push(
        `${url} uses a default database password: set ${passwordVar} to a random value (e.g. \`openssl rand -hex 32\`)`,
      );
    }
  }

  for (const key of ["STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"]) {
    const value = env[key];
    if (!value || KNOWN_DEFAULTS.has(value)) {
      errors.push(
        `${key} must be set to a non-default value; storage holds every organization's files`,
      );
    }
  }

  if (!(env.WEB_URL ?? "").startsWith("https://")) {
    warnings.push(
      "WEB_URL is not https: session cookies are sent without the Secure flag",
    );
  }
  if (!env.REDIS_PASSWORD) {
    warnings.push(
      "REDIS_PASSWORD is empty: keep Redis on a private network only",
    );
  }

  return { errors, warnings };
}

/** The decoded password of a database URL; "" when the URL is missing or malformed (the database client reports that). */
function databasePassword(url: string | undefined): string {
  if (!url) return "";
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return "";
  }
}

export interface CollabConfig {
  port: number
  secret: string
  allowedOrigins: string[]
  apiUrl: string
  maxDocBytes: number
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid collab configuration:\n- ${problems.join("\n- ")}`)
    this.name = "ConfigError"
  }
}

const SECRET_MIN_LENGTH = 16
const PRODUCTION_SECRET_MIN_LENGTH = 32

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollabConfig {
  const problems: string[] = []

  const port = parseInteger(env.COLLAB_PORT, 3002)
  if (port === undefined || port < 1 || port > 65535) {
    problems.push("COLLAB_PORT must be an integer between 1 and 65535")
  }

  const secret = env.COLLAB_INTERNAL_SECRET ?? ""
  // Production matches the API's startup check (32 characters); development keeps 16.
  const secretMinLength =
    env.NODE_ENV === "production" ? PRODUCTION_SECRET_MIN_LENGTH : SECRET_MIN_LENGTH
  if (secret.length < secretMinLength) {
    problems.push(
      `COLLAB_INTERNAL_SECRET is required and must be at least ${secretMinLength} characters`
    )
  }

  const allowedOrigins = (env.COLLAB_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
  if (allowedOrigins.length === 0) {
    problems.push(
      "COLLAB_ALLOWED_ORIGINS is required (comma-separated origins)"
    )
  }

  const apiUrl = (env.COLLAB_API_URL || "http://localhost:3001/api/v1").replace(
    /\/+$/,
    ""
  )

  const maxDocBytes = parseInteger(env.COLLAB_MAX_DOC_BYTES, 10485760)
  if (maxDocBytes === undefined || maxDocBytes < 1) {
    problems.push("COLLAB_MAX_DOC_BYTES must be a positive integer")
  }

  if (problems.length > 0 || port === undefined || maxDocBytes === undefined) {
    throw new ConfigError(problems)
  }

  return { port, secret, allowedOrigins, apiUrl, maxDocBytes }
}

/** Returns undefined when the value is set but is not a whole number. */
function parseInteger(
  raw: string | undefined,
  fallback: number
): number | undefined {
  if (raw === undefined || raw.trim() === "") return fallback
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : undefined
}

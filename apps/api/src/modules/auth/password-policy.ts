import { readFileSync } from "fs";
import { join } from "path";

/** NIST SP 800-63B-4 style: length and a blocklist, no composition rules (docs/specs/auth/hardening R-22, R-23). */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export interface PasswordContext {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
}

export type PasswordProblem =
  | { code: "PASSWORD_TOO_SHORT"; params: { min: number } }
  | { code: "PASSWORD_TOO_LONG"; params: { max: number } }
  | { code: "PASSWORD_TOO_COMMON" };

/** Lower case, no accents, no spaces: how passwords and context words are compared. */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");

const COMMON = new Set(
  readFileSync(
    join(__dirname, "..", "..", "..", "assets", "common-passwords.txt"),
    "utf8",
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")),
);

/** Words of the person and the organization a password must not be built on (4 letters or more). */
function contextWords(ctx: PasswordContext): string[] {
  const local = ctx.email.split("@")[0];
  return [
    local,
    ...local.split(/[._+-]/),
    ctx.firstName,
    ctx.lastName,
    ctx.organizationName,
    ...(ctx.organizationName?.split(/\s+/) ?? []),
  ]
    .filter((w): w is string => !!w)
    .map(normalize)
    .filter((w) => w.length >= 4);
}

/** The first problem with a new password, or null when it can be used. Never applied at sign-in. */
export function checkPassword(
  password: string,
  ctx: PasswordContext,
): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN)
    return { code: "PASSWORD_TOO_SHORT", params: { min: PASSWORD_MIN } };
  if (length > PASSWORD_MAX)
    return { code: "PASSWORD_TOO_LONG", params: { max: PASSWORD_MAX } };
  const value = normalize(password);
  if (COMMON.has(value) || contextWords(ctx).some((w) => value.includes(w)))
    return { code: "PASSWORD_TOO_COMMON" };
  return null;
}

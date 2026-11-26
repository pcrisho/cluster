import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";

export const SALT_ROUNDS = 12;

/**
 * bcrypt reads only the first 72 bytes; SHA-256 first turns any password into 44 base64 characters, so a
 * long one is never cut short (docs/specs/auth/hardening R-22). Base64 keeps NUL bytes out of bcrypt.
 */
const prehash = (password: string) =>
  createHash("sha256").update(password, "utf8").digest("base64");

/**
 * What a pending account (no password yet) stores instead of a hash: not a bcrypt string, so it verifies
 * nothing, and it costs no bcrypt at creation (docs/specs/auth/access-without-mail).
 */
export const UNUSABLE_PASSWORD = "!";

/** A bcrypt hash this module can compare against (not the marker). */
export const isUsableHash = (hash: string) =>
  hash !== UNUSABLE_PASSWORD && hash.startsWith("$2");

/** `rounds` is for tests only: a cheaper cost keeps fixtures fast. */
export const hashPassword = (password: string, rounds = SALT_ROUNDS) =>
  bcrypt.hash(prehash(password), rounds);

// shortcut: computed once at import (about 250 ms at startup); a different cost per hash would need one per cost.
const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));

/**
 * Checks a password against a stored hash, or against a dummy hash of the same cost when there is no
 * account, so the time it takes does not tell whether the email exists (docs/specs/auth/hardening R-28).
 */
export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  const usable = hash !== null && isUsableHash(hash);
  const ok = await bcrypt.compare(
    prehash(password),
    usable ? hash : await DUMMY_HASH,
  );
  return usable && ok;
}

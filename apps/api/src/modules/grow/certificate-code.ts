import { randomInt } from "crypto";

/** Crockford's Base32: no I, L, O or U, so a code read aloud or typed is unambiguous. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 12; // 60 bits

/** A new random, non-guessable code (stored without dashes). */
export function newCertificateCode(): string {
  return Array.from(
    { length: LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");
}

/** ABCD-EFGH-JKMN */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)!.join("-");
}

/** What someone typed or pasted, as a stored code: case, spaces and dashes ignored, O read as 0 and I/L as 1. */
export function normalizeCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return code.length === LENGTH &&
    [...code].every((c) => CODE_ALPHABET.includes(c))
    ? code
    : null;
}

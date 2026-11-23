import { randomInt } from "crypto";

export const INITIAL_PASSWORD_LENGTH = 16;

/** Letters and digits without the look-alikes 0, O, 1, l and I, so a password read off a sheet is typed right. */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random password an ADMIN hands over once (docs/specs/auth/access-without-mail). Never stored in clear. */
export function generateInitialPassword(): string {
  let password = "";
  for (let i = 0; i < INITIAL_PASSWORD_LENGTH; i++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

/**
 * TOTP (RFC 6238 over RFC 4226): HMAC-SHA1, 6 digits, 30 s steps, what every authenticator app speaks.
 * Built on node:crypto rather than a library: the algorithm is a few lines and fully specified, and the
 * current otplib pulls ESM-only dependencies Jest cannot load. Tested with the RFC's own vectors.
 */
const PERIOD = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Buffer): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return (bits.match(/.{1,5}/g) ?? [])
    .map((chunk) => BASE32[parseInt(chunk.padEnd(5, "0"), 2)])
    .join("");
}

function base32Decode(text: string): Buffer {
  const bits = [...text.replace(/=+$/, "").toUpperCase()]
    .map((c) => {
      const i = BASE32.indexOf(c);
      if (i < 0) throw new Error("Invalid base32");
      return i.toString(2).padStart(5, "0");
    })
    .join("");
  return Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
}

/** The HOTP value of one counter (RFC 4226 §5.3, dynamic truncation). */
export function hotp(
  key: Buffer,
  counter: number,
  digits = DIGITS,
  algorithm = "sha1",
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, key).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return value.toString().padStart(digits, "0");
}

/** A new secret: 160 bits, as base32 (what the QR code and manual entry carry). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const totpUri = (issuer: string, label: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;

/** The current code, for tests and the dev seed. */
export const totpNow = (
  secret: string,
  epoch = Math.floor(Date.now() / 1000),
) => hotp(base32Decode(secret), Math.floor(epoch / PERIOD));

/**
 * The time step of a valid code, or null. ±1 step of clock drift; a step at or before `lastStep` is
 * refused, so a code (even one still inside its window) is accepted only once.
 */
export function checkTotp(
  secret: string,
  code: string,
  lastStep: number | null,
  epoch = Math.floor(Date.now() / 1000),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const now = Math.floor(epoch / PERIOD);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    // Both are six digits, so the constant-time comparison applies.
    if (timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(code)))
      return step;
  }
  return null;
}

/** Crockford's Base32 (no I, L, O, U): recovery codes read aloud or typed without ambiguity. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A recovery code: 10 characters (50 bits), shown as XXXXX-XXXXX. */
export const newRecoveryCode = () =>
  Array.from({ length: 10 }, () => CROCKFORD[randomInt(CROCKFORD.length)]).join(
    "",
  );

/** What someone typed as a stored recovery code: case, spaces and dashes ignored. */
export const normalizeRecoveryCode = (input: string) =>
  input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

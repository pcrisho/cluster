import { randomBytes } from "crypto";
import { open, seal } from "./secret-box";
import {
  checkTotp,
  hotp,
  newRecoveryCode,
  newTotpSecret,
  normalizeRecoveryCode,
  totpNow,
  totpUri,
} from "./totp";

describe("secret box", () => {
  const key = randomBytes(32);

  it("opens what it sealed, and never shows the plain text", () => {
    const box = seal("JBSWY3DPEHPK3PXP", key);
    expect(box).not.toContain("JBSWY3DPEHPK3PXP");
    expect(open(box, key)).toBe("JBSWY3DPEHPK3PXP");
    expect(seal("same", key)).not.toBe(seal("same", key));
  });

  it("refuses a changed box or another key", () => {
    const box = seal("secret", key);
    const [iv, tag, data] = box.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() =>
      open([iv, tag, flipped.toString("base64url")].join("."), key),
    ).toThrow();
    expect(() => open(box, randomBytes(32))).toThrow();
  });
});

describe("RFC test vectors", () => {
  const key = Buffer.from("12345678901234567890");

  it("matches RFC 4226 appendix D (HOTP)", () => {
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    expect(expected.map((_, counter) => hotp(key, counter))).toEqual(expected);
  });

  it("matches RFC 6238 appendix B (TOTP, SHA-1, 8 digits)", () => {
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ];
    for (const [t, code] of vectors)
      expect(hotp(key, Math.floor(t / 30), 8)).toBe(code);
  });
});

describe("TOTP", () => {
  const secret = newTotpSecret();
  const now = 1_793_620_800; // a fixed instant, on a step boundary

  it("accepts the current code and one step of drift either way, not two", () => {
    expect(checkTotp(secret, totpNow(secret, now), null, now)).toBe(now / 30);
    expect(checkTotp(secret, totpNow(secret, now - 30), null, now)).toBe(
      now / 30 - 1,
    );
    expect(checkTotp(secret, totpNow(secret, now + 30), null, now)).toBe(
      now / 30 + 1,
    );
    expect(checkTotp(secret, totpNow(secret, now - 60), null, now)).toBeNull();
  });

  it("accepts a code only once", () => {
    const code = totpNow(secret, now);
    const step = checkTotp(secret, code, null, now)!;
    expect(checkTotp(secret, code, step, now)).toBeNull();
    expect(checkTotp(secret, totpNow(secret, now + 30), step, now + 30)).toBe(
      step + 1,
    );
  });

  it("refuses anything but six digits", () => {
    expect(checkTotp(secret, "12345", null, now)).toBeNull();
    expect(checkTotp(secret, "abcdef", null, now)).toBeNull();
  });

  it("builds an otpauth URI an authenticator app reads", () => {
    expect(totpUri("Cluster", "ana@acme.com", secret)).toBe(
      `otpauth://totp/Cluster:ana%40acme.com?secret=${secret}&issuer=Cluster&algorithm=SHA1&digits=6&period=30`,
    );
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });
});

describe("recovery codes", () => {
  it("are 10 unambiguous characters and survive how people type them", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(
      normalizeRecoveryCode(
        `${code.slice(0, 5).toLowerCase()} - ${code.slice(5)}`,
      ),
    ).toBe(code);
  });
});

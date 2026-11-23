import {
  CODE_ALPHABET,
  formatCode,
  newCertificateCode,
  normalizeCode,
} from "./certificate-code";

describe("certificate codes", () => {
  it("are 12 characters from Crockford's 32-symbol alphabet (no I, L, O, U)", () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
    for (const c of ["O", "I", "L", "U"])
      expect(CODE_ALPHABET).not.toContain(c);
    const codes = Array.from({ length: 500 }, () => newCertificateCode());
    for (const code of codes) {
      expect(code).toHaveLength(12);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    }
    expect(new Set(codes).size).toBe(500);
  });

  it("show grouped in fours and read back from what people type", () => {
    expect(formatCode("ABCDEFGHJKMN")).toBe("ABCD-EFGH-JKMN");
    expect(normalizeCode(" abcd-efgh-jkmn ")).toBe("ABCDEFGHJKMN");
    expect(normalizeCode("abcd efgh jkmn")).toBe("ABCDEFGHJKMN");
    // Look-alikes read as the digit they resemble.
    expect(normalizeCode("ABCD-EFGH-JKOL")).toBe("ABCDEFGHJK01");
    expect(normalizeCode("not a code")).toBeNull();
    expect(normalizeCode("ABCD-EFGH-JKM")).toBeNull();
  });
});

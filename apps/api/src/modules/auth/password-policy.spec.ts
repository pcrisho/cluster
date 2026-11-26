import { checkPassword, PASSWORD_MAX, PASSWORD_MIN } from "./password-policy";

const who = {
  email: "maria.lopez@acme.com",
  firstName: "María",
  lastName: "López",
  organizationName: "Acme Corp",
};

describe("password policy", () => {
  it("asks for 12 characters at least, counted as characters, not bytes", () => {
    expect(checkPassword("short-but-ok", who)).toBeNull();
    expect(checkPassword("eleven-char", who)).toEqual({
      code: "PASSWORD_TOO_SHORT",
      params: { min: PASSWORD_MIN },
    });
    expect(checkPassword("ñandúñandúñ", who)?.code).toBe("PASSWORD_TOO_SHORT"); // 11 characters, 16 bytes
  });

  it("has no composition rules: a phrase in lower case is fine", () => {
    expect(checkPassword("correct horse battery staple", who)).toBeNull();
    expect(checkPassword("una frase larga en minúsculas", who)).toBeNull();
  });

  it("refuses a common password, whatever its case and spaces", () => {
    expect(checkPassword("Password1234", who)?.code).toBe(
      "PASSWORD_TOO_COMMON",
    );
    expect(checkPassword("QWERTYUIOP12", who)?.code).toBe(
      "PASSWORD_TOO_COMMON",
    );
    expect(checkPassword("1234 5678 9012", who)?.code).toBe(
      "PASSWORD_TOO_COMMON",
    );
  });

  it("refuses a password built on the person or the organization", () => {
    expect(checkPassword("maria.lopez-2026", who)?.code).toBe(
      "PASSWORD_TOO_COMMON",
    );
    expect(checkPassword("SoyMaría2026!!", who)?.code).toBe(
      "PASSWORD_TOO_COMMON",
    );
    expect(checkPassword("lopez-seguro-2026", who)?.code).toBe(
      "PASSWORD_TOO_COMMON",
    );
    expect(checkPassword("acmecorp-2026!", who)?.code).toBe(
      "PASSWORD_TOO_COMMON",
    );
    // A word of fewer than 4 letters is too short to count.
    expect(
      checkPassword("una ola de mar", { ...who, firstName: "Ola" }),
    ).toBeNull();
  });

  it("accepts up to 128 characters and refuses more", () => {
    expect(checkPassword("x7".repeat(PASSWORD_MAX / 2), who)).toBeNull();
    expect(checkPassword("x7".repeat(PASSWORD_MAX / 2) + "y", who)?.code).toBe(
      "PASSWORD_TOO_LONG",
    );
  });
});

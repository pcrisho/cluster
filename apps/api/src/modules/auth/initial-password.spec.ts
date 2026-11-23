import { generateInitialPassword, INITIAL_PASSWORD_LENGTH } from "./initial-password";

describe("initial password generator", () => {
  it("is 16 characters from an alphabet with no 0, O, 1, l or I", () => {
    const password = generateInitialPassword();
    expect(password).toHaveLength(INITIAL_PASSWORD_LENGTH);
    expect(INITIAL_PASSWORD_LENGTH).toBe(16);
    expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
  });

  it("differs between calls", () => {
    const seen = new Set(Array.from({ length: 50 }, generateInitialPassword));
    expect(seen.size).toBe(50);
  });
});

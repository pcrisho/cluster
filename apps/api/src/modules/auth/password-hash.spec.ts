import { hashPassword, isUsableHash, UNUSABLE_PASSWORD, verifyPassword } from "./password-hash";

describe("password hash: pending accounts", () => {
  it("the unusable marker is not a usable hash and verifies nothing", async () => {
    expect(isUsableHash(UNUSABLE_PASSWORD)).toBe(false);
    expect(await verifyPassword("any password", UNUSABLE_PASSWORD)).toBe(false);
  });

  it("a real hash is usable and verifies its own password only", async () => {
    const hash = await hashPassword("Quiet-harbor-2026", 4);
    expect(isUsableHash(hash)).toBe(true);
    expect(await verifyPassword("Quiet-harbor-2026", hash)).toBe(true);
    expect(await verifyPassword("Other-harbor-2026", hash)).toBe(false);
  });
});

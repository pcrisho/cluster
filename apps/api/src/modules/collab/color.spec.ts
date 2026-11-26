import { collabColor } from "./color";

describe("collabColor", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `user-${i}-id`);

  it("is stable for the same id", () => {
    expect(collabColor(ids[0])).toBe(collabColor(ids[0]));
  });

  it("returns a hex colour", () => {
    for (const id of ids) expect(collabColor(id)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("spreads different ids over several colours", () => {
    expect(new Set(ids.map(collabColor)).size).toBeGreaterThan(1);
  });
});

import { EMPTY_SEEDS, ratio } from "@cluster/theme";
import { accentOf, canCustomize, effectiveSeeds, seedsOf, themeData } from "./theme";

describe("themeData", () => {
  it("normalises a hex to lowercase with #", () => {
    expect(themeData({ brandPrimary: "4C33E1" }, EMPTY_SEEDS)).toEqual({
      brandPrimary: "#4c33e1",
    });
  });

  it("rejects an unparsable hex with INVALID_COLOR", () => {
    expect(() => themeData({ brandPrimary: "zzz" }, EMPTY_SEEDS)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: "INVALID_COLOR" }),
      }),
    );
  });

  it("rejects a secondary without a primary, accepts it over a current primary", () => {
    expect(() => themeData({ brandSecondary: "#112233" }, EMPTY_SEEDS)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: "INVALID_COLOR" }),
      }),
    );
    const current = { ...EMPTY_SEEDS, brandPrimary: "#4c33e1" };
    expect(themeData({ brandSecondary: "#112233" }, current)).toEqual({
      brandSecondary: "#112233",
    });
  });

  it("rejects a secondary when the same payload resets the primary", () => {
    const current = { ...EMPTY_SEEDS, brandPrimary: "#4c33e1" };
    expect(() =>
      themeData({ brandPrimary: null, brandSecondary: "#112233" }, current),
    ).toThrow();
  });

  it("clears the secondary when the primary is reset on its own", () => {
    const current = { ...EMPTY_SEEDS, brandPrimary: "#4c33e1", brandSecondary: "#112233" }
    expect(themeData({ brandPrimary: null }, current)).toEqual({ brandPrimary: null, brandSecondary: null })
    expect(themeData({ brandPrimary: null }, EMPTY_SEEDS)).toEqual({ brandPrimary: null, brandSecondary: null })
  })

  it("accepts all nulls as a reset", () => {
    const all = {
      brandPrimary: null,
      brandSecondary: null,
      fontKey: null,
      radiusKey: null,
    };
    expect(themeData(all, EMPTY_SEEDS)).toEqual(all);
  });
});

describe("seedsOf", () => {
  it("reads a row through the strict parser", () => {
    expect(
      seedsOf({
        brandPrimary: "#4C33E1",
        brandSecondary: null,
        fontKey: "nope",
        radiusKey: "round",
      }),
    ).toEqual({
      brandPrimary: "#4c33e1",
      brandSecondary: null,
      fontKey: null,
      radiusKey: "round",
    });
  });
});

describe("accentOf", () => {
  it("is null without a primary", () => {
    expect(accentOf(EMPTY_SEEDS)).toBeNull();
  });

  it("is readable on white paper even for a light seed", () => {
    const accent = accentOf({ ...EMPTY_SEEDS, brandPrimary: "#ffd400" });
    expect(ratio(accent!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("does not depend on the secondary", () => {
    const primary = { ...EMPTY_SEEDS, brandPrimary: "#4c33e1" };
    expect(accentOf({ ...primary, brandSecondary: "#0a8f5b" })).toBe(
      accentOf(primary),
    );
  });
});

describe("canCustomize", () => {
  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ])("master %s + organization %s = %s", (orgThemingAllowed, themingEnabled, expected) => {
    expect(canCustomize({ orgThemingAllowed }, { themingEnabled })).toBe(expected);
  });
});

describe("effectiveSeeds", () => {
  const instance = {
    brandPrimary: "#1f2a44",
    brandSecondary: "#00c853",
    fontKey: "geist",
    radiusKey: "round",
    orgThemingAllowed: true,
  };
  const org = {
    brandPrimary: "#0f766e",
    brandSecondary: null,
    fontKey: "dm-sans",
    radiusKey: null,
    themingEnabled: true,
  };
  const instanceSeeds = {
    brandPrimary: "#1f2a44",
    brandSecondary: "#00c853",
    fontKey: "geist",
    radiusKey: "round",
  };

  it("ignores the organization seeds when the master switch is off", () => {
    expect(effectiveSeeds({ ...instance, orgThemingAllowed: false }, org)).toEqual(instanceSeeds);
  });

  it("ignores them when the organization switch is off", () => {
    expect(effectiveSeeds(instance, { ...org, themingEnabled: false })).toEqual(instanceSeeds);
  });

  it("lets the organization colours win as one block when both switches are on", () => {
    expect(effectiveSeeds(instance, org)).toEqual({
      brandPrimary: "#0f766e",
      brandSecondary: null,
      fontKey: "dm-sans",
      radiusKey: "round",
    });
  });

  it("keeps the instance colours when the organization primary is unset, font and radius inherit on their own", () => {
    expect(effectiveSeeds(instance, { ...org, brandPrimary: null })).toEqual({
      ...instanceSeeds,
      fontKey: "dm-sans",
    });
  });
});

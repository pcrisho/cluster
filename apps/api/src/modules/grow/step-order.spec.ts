import { blockingStep, nextStep, orderSteps, progressOf } from "./step-order";

const step = (id: string, position: number, required = true) => ({
  id,
  position,
  required,
});

describe("step-order", () => {
  // Sections and steps arrive unordered from the database.
  const ordered = orderSteps([
    { position: 1, steps: [step("c", 1), step("d", 0, false)] },
    { position: 0, steps: [step("b", 1), step("a", 0)] },
    { position: 2, steps: [step("e", 0)] },
  ]);

  it("orders steps by section, then by position", () => {
    expect(ordered.map((s) => s.id)).toEqual(["a", "b", "d", "c", "e"]);
  });

  describe("blockingStep", () => {
    it("never blocks a free-order course", () => {
      expect(blockingStep(ordered, new Set(), "e", false)).toBeNull();
    });

    it("blocks on the earliest required step not done", () => {
      expect(blockingStep(ordered, new Set(["a"]), "e", true)?.id).toBe("b");
      expect(blockingStep(ordered, new Set(), "c", true)?.id).toBe("a");
    });

    it("lets the first step and steps after done ones open", () => {
      expect(blockingStep(ordered, new Set(), "a", true)).toBeNull();
      expect(blockingStep(ordered, new Set(["a", "b"]), "c", true)).toBeNull();
    });

    it("an optional step never blocks", () => {
      // d is optional and not done; c still opens.
      expect(blockingStep(ordered, new Set(["a", "b"]), "c", true)).toBeNull();
    });

    it("an unknown step is not blocked by anything", () => {
      expect(blockingStep(ordered, new Set(), "zz", true)).toBeNull();
    });
  });

  it("counts required steps only", () => {
    expect(progressOf(ordered, new Set(["a", "d"]))).toEqual({
      done: 1,
      total: 4,
    });
    expect(progressOf(ordered, new Set(["a", "b", "c", "e"]))).toEqual({
      done: 4,
      total: 4,
    });
  });

  it("the next step is the first one not done", () => {
    expect(nextStep(ordered, new Set(["a"]))?.id).toBe("b");
    expect(nextStep(ordered, new Set(["a", "b"]))?.id).toBe("d");
    expect(nextStep(ordered, new Set(["a", "b", "c", "d", "e"]))).toBeNull();
  });
});

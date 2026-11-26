import { insertAt } from "./page-order";

describe("insertAt", () => {
  it("places the page at the given position", () => {
    expect(insertAt(["a", "b", "c"], "x", 0)).toEqual(["x", "a", "b", "c"]);
    expect(insertAt(["a", "b", "c"], "x", 2)).toEqual(["a", "b", "x", "c"]);
  });

  it("clamps an index outside the list", () => {
    expect(insertAt(["a", "b"], "x", 99)).toEqual(["a", "b", "x"]);
    expect(insertAt(["a", "b"], "x", -3)).toEqual(["x", "a", "b"]);
    expect(insertAt([], "x", 5)).toEqual(["x"]);
  });
});

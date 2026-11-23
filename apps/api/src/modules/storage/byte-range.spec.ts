import { parseByteRange } from "./byte-range";

describe("parseByteRange", () => {
  it("reads closed, open and suffix ranges", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=500-", 1000)).toEqual({
      start: 500,
      end: 999,
    });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it("clamps the end and a suffix longer than the file", () => {
    expect(parseByteRange("bytes=900-5000", 1000)).toEqual({
      start: 900,
      end: 999,
    });
    expect(parseByteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("answers 416 for a start past the end or an empty suffix", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-", 0)).toBe("unsatisfiable");
  });

  it("serves the whole file for no, malformed, reversed or multiple ranges", () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange("bytes=-", 1000)).toBeNull();
    expect(parseByteRange("items=0-1", 1000)).toBeNull();
    expect(parseByteRange("bytes=9-3", 1000)).toBeNull();
    expect(parseByteRange("bytes=0-1,5-6", 1000)).toBeNull();
  });
});

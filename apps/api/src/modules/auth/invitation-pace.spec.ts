import { paceIntervalMs, parsePerMinute } from "./invitation-pace";

describe("invitation pace", () => {
  it("defaults to 60 a minute when unset or not a number", () => {
    expect(parsePerMinute(undefined)).toBe(60);
    expect(parsePerMinute("")).toBe(60);
    expect(parsePerMinute("fast")).toBe(60);
    expect(parsePerMinute("-5")).toBe(60);
  });

  it("reads a whole number; 0 pauses the sender", () => {
    expect(parsePerMinute("120")).toBe(120);
    expect(parsePerMinute("0")).toBe(0);
  });

  it("one invitation every 60 000 / n ms", () => {
    expect(paceIntervalMs(60)).toBe(1000);
    expect(paceIntervalMs(600)).toBe(100);
    expect(paceIntervalMs(7)).toBe(8572);
  });
});

import { describeUserAgent } from "./user-agent"

describe("describeUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      { browser: "Chrome", os: "Linux" },
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      { browser: "Edge", os: "Windows" },
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      { browser: "Safari", os: "macOS" },
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      { browser: "Safari", os: "iOS" },
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      { browser: "Chrome", os: "Android" },
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
      { browser: "Firefox", os: "Windows" },
    ],
  ])("names %s", (ua, expected) => {
    expect(describeUserAgent(ua)).toEqual(expected)
  })

  it("gives up on what it does not know", () => {
    expect(describeUserAgent(null)).toBeNull()
    expect(describeUserAgent("curl/8.0")).toBeNull()
  })
})

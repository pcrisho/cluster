import { contentSecurityPolicy } from "./csp"

const urls = {
  api: "https://api.example.com/api/v1",
  ws: "https://api.example.com",
  collab: "wss://collab.example.com",
}
const directives = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ")
      return [name, values]
    })
  )

describe("contentSecurityPolicy", () => {
  it("allows scripts only by nonce, and nothing to embed or frame the app", () => {
    const d = directives(contentSecurityPolicy("abc123", urls, false))
    expect(d["script-src"]).toEqual(["'nonce-abc123'", "'strict-dynamic'"])
    expect(d["object-src"]).toEqual(["'none'"])
    expect(d["base-uri"]).toEqual(["'none'"])
    expect(d["frame-ancestors"]).toEqual(["'none'"])
    expect(d["default-src"]).toEqual(["'self'"])
  })

  it("reaches the API, its socket and collab by origin, and frames only the API and the video hosts", () => {
    const d = directives(contentSecurityPolicy("n", urls, false))
    expect(d["connect-src"]).toEqual([
      "'self'",
      "https://api.example.com",
      "wss://api.example.com",
      "wss://collab.example.com",
    ])
    expect(d["img-src"]).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://api.example.com",
    ])
    expect(d["frame-src"]).toEqual([
      "https://api.example.com",
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
      "https://drive.google.com",
    ])
  })

  it("plays uploaded lesson videos from the API (and nothing else) in the page", () => {
    const d = directives(contentSecurityPolicy("n", urls, false))
    expect(d["media-src"]).toEqual([
      "'self'",
      "blob:",
      "https://api.example.com",
    ])
  })

  it("lets the dev server evaluate and hot-reload", () => {
    const d = directives(contentSecurityPolicy("n", urls, true))
    expect(d["script-src"]).toContain("'unsafe-eval'")
    expect(d["connect-src"]).toContain("ws:")
  })
})

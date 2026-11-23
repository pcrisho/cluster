import { isTokenExpiring } from "./access-token"

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0)
const MARGIN = 30_000

function jwt(payload: unknown): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`
}

describe("isTokenExpiring", () => {
  it("is false for a token that expires well after the margin", () => {
    const token = jwt({ exp: NOW / 1000 + 900 })
    expect(isTokenExpiring(token, NOW, MARGIN)).toBe(false)
  })

  it("is true for a token already expired", () => {
    const token = jwt({ exp: NOW / 1000 - 1 })
    expect(isTokenExpiring(token, NOW, MARGIN)).toBe(true)
  })

  it("is true when the token expires within the margin", () => {
    const token = jwt({ exp: NOW / 1000 + 20 })
    expect(isTokenExpiring(token, NOW, MARGIN)).toBe(true)
  })

  it("is true for null", () => {
    expect(isTokenExpiring(null, NOW, MARGIN)).toBe(true)
  })

  it("is true for a malformed token", () => {
    expect(isTokenExpiring("not-a-jwt", NOW, MARGIN)).toBe(true)
    expect(isTokenExpiring("a.!!!.c", NOW, MARGIN)).toBe(true)
  })

  it("is true when the payload has no numeric exp", () => {
    expect(isTokenExpiring(jwt({ sub: "user" }), NOW, MARGIN)).toBe(true)
    expect(isTokenExpiring(jwt({ exp: "soon" }), NOW, MARGIN)).toBe(true)
  })
})

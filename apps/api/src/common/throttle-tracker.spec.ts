import { throttleTracker } from "./throttle-tracker"

describe("throttleTracker", () => {
  const ip = "203.0.113.7"

  it("counts signed-in requests per person, whatever the address", () => {
    expect(throttleTracker({ ip, path: "/api/v1/grow/learning", user: { id: "u1" } })).toBe("user:u1")
    expect(throttleTracker({ ip: "198.51.100.1", path: "/api/v1/grow/learning", user: { id: "u1" } })).toBe(
      "user:u1",
    )
  })

  it("counts refresh and logout per owner of a valid token, otherwise per address", () => {
    expect(throttleTracker({ ip, path: "/api/v1/auth/refresh" }, "u1")).toBe("session:u1")
    expect(throttleTracker({ ip, path: "/api/v1/auth/logout" }, "u1")).toBe("session:u1")
    expect(throttleTracker({ ip, path: "/api/v1/auth/refresh" }, null)).toBe(`ip:${ip}`)
    // An owner only matters on the session routes.
    expect(throttleTracker({ ip, path: "/api/v1/grow/verify/ABCD" }, "u1")).toBe(`ip:${ip}`)
  })

  it("counts sign-in per address and account, ignoring case and spaces", () => {
    const one = throttleTracker({ ip, path: "/api/v1/auth/login", body: { email: "Ana@Acme.com " } })
    expect(one).toBe(throttleTracker({ ip, path: "/api/v1/auth/login", body: { email: "ana@acme.com" } }))
    expect(one).not.toBe(throttleTracker({ ip, path: "/api/v1/auth/login", body: { email: "bob@acme.com" } }))
    expect(one).not.toBe(
      throttleTracker({ ip: "198.51.100.1", path: "/api/v1/auth/login", body: { email: "ana@acme.com" } }),
    )
  })

  it("counts other public routes, and malformed bodies, per address", () => {
    expect(throttleTracker({ ip, path: "/api/v1/auth/register", body: { email: "ana@acme.com" } })).toBe(`ip:${ip}`)
    expect(throttleTracker({ ip, path: "/api/v1/auth/forgot-password", body: { email: "a@b.c" } })).toBe(`ip:${ip}`)
    expect(throttleTracker({ ip, path: "/api/v1/grow/verify/ABCD" })).toBe(`ip:${ip}`)
    expect(throttleTracker({ ip, path: "/api/v1/auth/login", body: null })).toBe(`ip:${ip}`)
  })
})

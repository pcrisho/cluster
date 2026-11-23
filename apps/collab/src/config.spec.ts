import { ConfigError, loadConfig } from "./config"

const SECRET = "0123456789abcdef"
const base = {
  COLLAB_INTERNAL_SECRET: SECRET,
  COLLAB_ALLOWED_ORIGINS: "http://localhost:3000",
}

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig({ ...base })).toEqual({
      port: 3002,
      secret: SECRET,
      allowedOrigins: ["http://localhost:3000"],
      apiUrl: "http://localhost:3001/api/v1",
      maxDocBytes: 10485760,
    })
  })

  it("reports every missing required variable at once", () => {
    let error: unknown
    try {
      loadConfig({})
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ConfigError)
    expect((error as Error).message).toContain("COLLAB_INTERNAL_SECRET")
    expect((error as Error).message).toContain("COLLAB_ALLOWED_ORIGINS")
  })

  it("rejects a port out of range", () => {
    expect(() => loadConfig({ ...base, COLLAB_PORT: "70000" })).toThrow(
      /COLLAB_PORT/
    )
    expect(() => loadConfig({ ...base, COLLAB_PORT: "0" })).toThrow(
      /COLLAB_PORT/
    )
    expect(() => loadConfig({ ...base, COLLAB_PORT: "abc" })).toThrow(
      /COLLAB_PORT/
    )
  })

  it("rejects a short secret", () => {
    expect(() =>
      loadConfig({ ...base, COLLAB_INTERNAL_SECRET: "short" })
    ).toThrow(/COLLAB_INTERNAL_SECRET/)
  })

  it("requires 32 characters in production and 16 elsewhere", () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: "production" })
    ).toThrow(/at least 32 characters/)
    expect(
      loadConfig({
        ...base,
        NODE_ENV: "production",
        COLLAB_INTERNAL_SECRET: "0".repeat(32),
      }).secret
    ).toHaveLength(32)
    expect(() => loadConfig({ ...base, NODE_ENV: "development" })).not.toThrow()
  })

  it("parses and trims the allowed origins, dropping empty entries", () => {
    const config = loadConfig({
      ...base,
      COLLAB_ALLOWED_ORIGINS: " http://a.test , ,https://b.test ",
    })
    expect(config.allowedOrigins).toEqual(["http://a.test", "https://b.test"])
  })

  it("rejects an empty origin list", () => {
    expect(() =>
      loadConfig({ ...base, COLLAB_ALLOWED_ORIGINS: " , " })
    ).toThrow(/COLLAB_ALLOWED_ORIGINS/)
  })

  it("removes the trailing slash of the API url", () => {
    const config = loadConfig({
      ...base,
      COLLAB_API_URL: "http://api.test/api/v1/",
    })
    expect(config.apiUrl).toBe("http://api.test/api/v1")
  })

  it("rejects a non-positive max document size", () => {
    expect(() => loadConfig({ ...base, COLLAB_MAX_DOC_BYTES: "0" })).toThrow(
      /COLLAB_MAX_DOC_BYTES/
    )
  })
})

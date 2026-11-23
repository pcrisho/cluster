import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { createActor, createTestApp, type TestActor } from "../test-helpers"

/** Every error answers with a stable `code` the web translates (common/http-exception.filter.ts). */
describe("HTTP error codes e2e", () => {
  let app: INestApplication
  let http: ReturnType<typeof request>
  let member: TestActor

  beforeAll(async () => {
    app = await createTestApp()
    http = request(app.getHttpServer())
    member = await createActor(app, "codes-member")
  })

  afterAll(() => app.close())

  it("names a status when the error carries no code", async () => {
    const missing = await http.get("/api/v1/know/spaces/00000000-0000-0000-0000-000000000000").set(member.auth)
    expect(missing.status).toBe(404)
    expect(missing.body).toMatchObject({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) })

    const forbidden = await http.get("/api/v1/instance/settings").set(member.auth).expect(403)
    expect(forbidden.body.code).toBe("FORBIDDEN")

    const anonymous = await http.get("/api/v1/auth/me").expect(401)
    expect(anonymous.body.code).toBe("UNAUTHORIZED")
  })

  it("names validation errors and keeps one message per field", async () => {
    const res = await http.patch("/api/v1/auth/me").set(member.auth).send({ locale: "fr" }).expect(400)
    expect(res.body.code).toBe("VALIDATION_FAILED")
    expect(res.body.message).toEqual([expect.stringContaining("locale")])
  })

  it("keeps the specific code a rule throws", async () => {
    const res = await http
      .post("/api/v1/auth/login")
      .send({ email: `nobody-${Date.now()}@x.com`, password: "Whatever123" })
      .expect(401)
    expect(res.body).toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS", message: "Invalid credentials" })
  })
})

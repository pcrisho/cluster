import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../test-helpers";

/** Body size limits apply before authentication: a parsed body reaches the guard (401), an oversized one stops at 413. */
describe("Body parser limits e2e", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const body = (kb: number) => ({ text: "x".repeat(kb * 1024) });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(async () => app?.close());

  it("keeps 100 kb for ordinary routes", async () => {
    await http.post("/api/v1/grow/courses").send(body(200)).expect(413);
  });

  it("accepts up to 1 MB on the LMS step content routes", async () => {
    await http
      .post("/api/v1/grow/sections/s1/steps")
      .send(body(900))
      .expect(401);
    await http.patch("/api/v1/grow/steps/s1").send(body(900)).expect(401);
    await http.patch("/api/v1/grow/steps/s1").send(body(1100)).expect(413);
    // the move route is not step content
    await http.patch("/api/v1/grow/steps/s1/move").send(body(200)).expect(413);
  });
});

import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp } from "../../test-helpers";
import { UNUSABLE_PASSWORD } from "../auth/password-hash";

/** A member created without a password holds no hash to check: no bcrypt at creation, no sign-in. */
describe("Pending account (no password) e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("stores the unusable marker and refuses every sign-in", async () => {
    const admin = await createActor(app, "pa-admin", "ADMIN");
    const email = `pending-${Date.now()}@x.com`;
    const created = await request(app.getHttpServer())
      .post("/api/v1/org/members")
      .set(admin.auth)
      .send({ email, firstName: "Pen", lastName: "Ding", role: "COLLABORATOR" })
      .expect(201);

    const row = await app
      .get(SystemPrismaService)
      .user.findUniqueOrThrow({ where: { id: created.body.member.id } });
    expect(row.passwordSetAt).toBeNull();
    expect(row.passwordHash).toBe(UNUSABLE_PASSWORD);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "Quiet-harbor-2026" })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe("INVALID_CREDENTIALS"));
  });
});

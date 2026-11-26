import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp } from "../../test-helpers";

/** An email is unique across the instance, even though rows of other organizations are invisible to an admin. */
describe("Member email uniqueness e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("answers 409 EMAIL_TAKEN when the email belongs to a member of another organization", async () => {
    const admin = await createActor(app, "em-admin", "ADMIN");
    const other = await createActor(app, "em-other");
    const { email } = await app
      .get(SystemPrismaService)
      .user.findUniqueOrThrow({ where: { id: other.id } });

    const res = await request(app.getHttpServer())
      .post("/api/v1/org/members")
      .set(admin.auth)
      .send({ email, firstName: "Dup", lastName: "Licate", role: "COLLABORATOR" })
      .expect(409);
    expect(res.body).toMatchObject({ code: "EMAIL_TAKEN", message: "Email already registered" });
  });
});

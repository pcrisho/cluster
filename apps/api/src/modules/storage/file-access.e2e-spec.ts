import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createActor, createTestApp, TestActor } from "../../test-helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\nx\n");

/**
 * GET /files/*key: being in the organization is not enough. A page or space image needs read
 * access to its space, a course file needs access to its course; only `uploads/` (avatars, feed,
 * lesson text) is organization-wide.
 */
describe("File read access e2e", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let member: TestActor;

  const file = (who: TestActor, key: string) =>
    http.get(`/api/v1/files/${key}`).set(who.auth);
  const json = (
    who: TestActor,
    method: "post" | "get",
    path: string,
    body?: object,
  ) => http[method](`/api/v1${path}`).set(who.auth).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    admin = await createActor(app, "files-admin", "ADMIN");
    member = await createActor(
      app,
      "files-member",
      "COLLABORATOR",
      admin.orgId,
    );
  });

  afterAll(async () => app?.close());

  const pageImage = async (restricted: boolean) => {
    const space = await json(admin, "post", "/know/spaces", {
      name: "Files",
      restricted,
    }).expect(201);
    const page = await json(
      admin,
      "post",
      `/know/spaces/${space.body.data.id}/pages`,
      { title: "P" },
    ).expect(201);
    const image = await http
      .post(`/api/v1/know/pages/${page.body.data.id}/images`)
      .set(admin.auth)
      .attach("file", PNG, { filename: "a.png", contentType: "image/png" })
      .expect(201);
    return {
      spaceId: space.body.data.id as string,
      key: image.body.data.key as string,
    };
  };

  it("a page image follows the access of its space", async () => {
    const { spaceId, key } = await pageImage(true);
    await file(admin, key).expect(200);
    await file(member, key).expect(404);

    await json(admin, "post", `/know/spaces/${spaceId}/access`, {
      principalType: "USER",
      principalId: member.id,
      role: "VIEWER",
    }).expect(201);
    await file(member, key).expect(200);
  });

  it("an image of an open space is readable by the whole organization", async () => {
    const { key } = await pageImage(false);
    await file(member, key).expect(200);
  });

  it("a course file needs access to its course", async () => {
    const course = await json(admin, "post", "/grow/courses", {
      title: "Files",
    }).expect(201);
    const upload = await http
      .post(`/api/v1/grow/courses/${course.body.id}/files`)
      .set(admin.auth)
      .attach("file", PDF, {
        filename: "a.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    await file(admin, upload.body.key).expect(200);
    // A draft is invisible to learners.
    await file(member, upload.body.key).expect(404);
  });

  it("generic uploads stay organization-wide", async () => {
    const upload = await http
      .post("/api/v1/files/images")
      .set(admin.auth)
      .attach("file", PNG, { filename: "a.png", contentType: "image/png" })
      .expect(201);
    await file(member, upload.body.key).expect(200);
  });

  it("a prefix no feature owns is not served", async () => {
    await file(admin, `organizations/${admin.orgId}/elsewhere/x/a.png`).expect(
      404,
    );
  });
});

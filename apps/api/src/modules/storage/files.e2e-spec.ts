import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { config } from "dotenv";
import { resolve } from "path";
import { AppModule } from "../../app.module";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { signToken, WEB_ORIGIN } from "../../test-helpers";
import { hashPassword } from "../auth/password-hash";

config({ path: resolve(__dirname, "../../../../../.env") });

// 1x1 transparent PNG (passes magic-byte validation)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const binary = (
  res: request.Response,
  cb: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

/** Private storage: every file goes through /files with session + organization checks. */
describe("Files (private storage) e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let fileCookie: string;
  let otherOrgToken: string;
  let pageId: string;
  let pageImageKey: string;
  const ts = Date.now();

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: "default", limit: 10000, ttl: 60000 },
        ]),
        AppModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());

    // An ADMIN of the seeded organization who signs in for real, to get the file cookie.
    const seeded = await prisma.organization.findUniqueOrThrow({
      where: { slug: "cluster" },
    });
    await prisma.user.create({
      data: {
        email: `files-admin-${ts}@x.com`,
        passwordHash: await hashPassword("Files-admin-2026", 4),
        firstName: "Files",
        lastName: "Admin",
        role: "ADMIN",
        organizationId: seeded.id,
      },
    });
    const login = await http
      .post("/api/v1/auth/login")
      .send({ email: `files-admin-${ts}@x.com`, password: "Files-admin-2026" })
      .expect(200);
    adminToken = login.body.accessToken;
    expect(login.body.fileToken).toBeUndefined();
    const setCookie = ([] as string[]).concat(
      login.headers["set-cookie"] ?? [],
    );
    const cookie = setCookie.find((c) => c.startsWith("cluster_files="))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    fileCookie = cookie.split(";")[0];

    const otherOrg = await prisma.organization.create({
      data: { name: `Files other ${ts}`, slug: `files-other-${ts}` },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `files-outsider-${ts}@x.com`,
        passwordHash: "x",
        firstName: "Out",
        lastName: "Sider",
        role: "ADMIN",
        organizationId: otherOrg.id,
      },
    });
    otherOrgToken = await signToken(app, outsider.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it("KNOW page image: upload, then download by URL with the file cookie (as an <img> would)", async () => {
    const space = await http
      .post("/api/v1/know/spaces")
      .set(bearer(adminToken))
      .send({ name: `Files ${ts}`, icon: "book-open" })
      .expect(201);
    const page = await http
      .post(`/api/v1/know/spaces/${space.body.data.id}/pages`)
      .set(bearer(adminToken))
      .send({ title: "Image page" })
      .expect(201);
    pageId = page.body.data.id;

    const upload = await http
      .post(`/api/v1/know/pages/${pageId}/images`)
      .set(bearer(adminToken))
      .attach("file", PNG, { filename: "cover.png", contentType: "image/png" })
      .expect(201);
    pageImageKey = upload.body.data.key;
    const url = new URL(upload.body.data.url);
    expect(url.pathname).toBe(`/api/v1/files/${pageImageKey}`);

    const res = await http
      .get(url.pathname)
      .set("Cookie", fileCookie)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("generic image uploads are served from /files", async () => {
    const generic = await http
      .post("/api/v1/files/images")
      .set(bearer(adminToken))
      .attach("file", PNG, { filename: "avatar.png", contentType: "image/png" })
      .expect(201);
    expect(generic.body.key).toMatch(
      /^organizations\/[\w-]+\/uploads\/[\w-]+\.png$/,
    );
    await http
      .get(`/api/v1/files/${generic.body.key}`)
      .set(bearer(adminToken))
      .expect(200);
    await http
      .get(`/api/v1/files/${generic.body.key}`)
      .set("Cookie", fileCookie)
      .expect(200);
  });

  it("answers byte ranges (video seeking) with 206, 416 and the full file otherwise", async () => {
    const { body } = await http
      .post("/api/v1/files/images")
      .set(bearer(adminToken))
      .attach("file", PNG, { filename: "range.png", contentType: "image/png" })
      .expect(201);
    const url = `/api/v1/files/${body.key}`;

    const full = await http
      .get(url)
      .set("Cookie", fileCookie)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(full.headers["accept-ranges"]).toBe("bytes");
    expect(full.headers["content-length"]).toBe(String(PNG.length));

    const head = await http
      .get(url)
      .set("Cookie", fileCookie)
      .set("Range", "bytes=0-7")
      .buffer(true)
      .parse(binary)
      .expect(206);
    expect(head.headers["content-range"]).toBe(`bytes 0-7/${PNG.length}`);
    expect(head.headers["content-length"]).toBe("8");
    expect(Buffer.compare(head.body as Buffer, PNG.subarray(0, 8))).toBe(0);

    const tail = await http
      .get(url)
      .set("Cookie", fileCookie)
      .set("Range", "bytes=-4")
      .buffer(true)
      .parse(binary)
      .expect(206);
    expect(
      Buffer.compare(tail.body as Buffer, PNG.subarray(PNG.length - 4)),
    ).toBe(0);

    const open = await http
      .get(url)
      .set("Cookie", fileCookie)
      .set("Range", "bytes=60-")
      .buffer(true)
      .parse(binary)
      .expect(206);
    expect(open.headers["content-range"]).toBe(
      `bytes 60-${PNG.length - 1}/${PNG.length}`,
    );

    const past = await http
      .get(url)
      .set("Cookie", fileCookie)
      .set("Range", `bytes=${PNG.length}-`)
      .expect(416);
    expect(past.headers["content-range"]).toBe(`bytes */${PNG.length}`);

    // Several ranges at once are not worth a multipart body: the whole file.
    await http
      .get(url)
      .set("Cookie", fileCookie)
      .set("Range", "bytes=0-1,4-5")
      .expect(200);

    // A range never skips the access check.
    await http
      .get(url)
      .set(bearer(otherOrgToken))
      .set("Range", "bytes=0-7")
      .expect(404);
    await http.get(url).set("Range", "bytes=0-7").expect(401);
  });

  it("rejects non-images disguised as images", async () => {
    await http
      .post("/api/v1/files/images")
      .set(bearer(adminToken))
      .attach("file", Buffer.from("<svg onload=alert(1)>"), {
        filename: "x.png",
        contentType: "image/png",
      })
      .expect(400);
  });

  it("denies anonymous access, other organizations and missing files", async () => {
    await http.get(`/api/v1/files/${pageImageKey}`).expect(401);
    // Another organization cannot tell the file exists
    await http
      .get(`/api/v1/files/${pageImageKey}`)
      .set(bearer(otherOrgToken))
      .expect(404);
    const orgId = pageImageKey.split("/")[1];
    await http
      .get(`/api/v1/files/organizations/${orgId}/uploads/missing.png`)
      .set("Cookie", fileCookie)
      .expect(404);
  });

  it("the file cookie only works on file routes", async () => {
    await http.get("/api/v1/auth/me").set("Cookie", fileCookie).expect(401);
    await http.get("/api/v1/know/spaces").set("Cookie", fileCookie).expect(401);
  });

  it("the storage bucket is not publicly readable", async () => {
    const s3 = `http://${process.env.STORAGE_HOST || "localhost"}:${process.env.STORAGE_PORT || "9000"}`;
    const res = await fetch(
      `${s3}/${process.env.STORAGE_BUCKET || "cluster"}/${pageImageKey}`,
    );
    expect(res.status).toBe(403);
  });

  it("documents download with the file cookie (opened as a link)", async () => {
    const created = await http
      .post(`/api/v1/know/pages/${pageId}/documents`)
      .set(bearer(adminToken))
      .attach("file", Buffer.from("%PDF-1.4 fake"), {
        filename: "doc.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    const url = new URL(created.body.data.currentVersion.url);
    await http.get(url.pathname).set("Cookie", fileCookie).expect(200);
    await http.get(url.pathname).expect(401);
  });

  it("logout clears the cookie; deactivated users lose access immediately", async () => {
    const logout = await http
      .post("/api/v1/auth/logout")
      .set("Origin", WEB_ORIGIN)
      .expect(204);
    expect(
      ([] as string[]).concat(logout.headers["set-cookie"] ?? []).join(),
    ).toMatch(/cluster_files=;/);

    const member = await prisma.user.create({
      data: {
        email: `files-member-${ts}@x.com`,
        passwordHash: "x",
        firstName: "Mem",
        lastName: "Ber",
        organizationId: (
          await prisma.user.findUniqueOrThrow({
            where: { email: "admin@cluster.example" },
          })
        ).organizationId,
        isActive: false,
      },
    });
    const memberToken = await signToken(app, member.id);
    await http
      .get(`/api/v1/files/${pageImageKey}`)
      .set(bearer(memberToken))
      .expect(401);
  });
});

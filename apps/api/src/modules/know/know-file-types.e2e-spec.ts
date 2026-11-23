import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, TestActor } from "../../test-helpers";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1");
const BMP = Buffer.concat([Buffer.from("BM"), Buffer.alloc(60)]);
const ZIP = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.alloc(60),
]);
const ftyp = (major: string, ...compatible: string[]) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 16 + compatible.length * 4]),
    Buffer.from(`ftyp${major}`, "latin1"),
    Buffer.alloc(4),
    Buffer.from(compatible.join(""), "latin1"),
    Buffer.alloc(40),
  ]);

/** Upload rules of KNOW pages: the shared catalog in `@cluster/editor-schema`. */
describe("KNOW file types e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let owner: TestActor;
  let pageId: string;

  const api = (p: string) => `/api/v1/know${p}`;
  const image = (buf: Buffer, filename: string, contentType: string) =>
    http
      .post(api(`/pages/${pageId}/images`))
      .set(owner.auth)
      .attach("file", buf, { filename, contentType });
  const document = (buf: Buffer, filename: string, contentType: string) =>
    http
      .post(api(`/pages/${pageId}/documents`))
      .set(owner.auth)
      .attach("file", buf, { filename, contentType });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    owner = await createActor(app, "types-owner", "ADMIN");
    const space = await http
      .post(api("/spaces"))
      .set(owner.auth)
      .send({ name: "Types" })
      .expect(201);
    const page = await http
      .post(api(`/spaces/${space.body.data.id}/pages`))
      .set(owner.auth)
      .send({ title: "Types page" })
      .expect(201);
    pageId = page.body.data.id;
  });

  afterAll(async () => app?.close());

  describe("images in the body", () => {
    it("accepts GIF, BMP and AVIF", async () => {
      const gif = await image(GIF, "a.gif", "image/gif").expect(201);
      expect(gif.body.data.key).toMatch(/\.gif$/);
      const bmp = await image(BMP, "scan.bmp", "image/bmp").expect(201);
      expect(bmp.body.data.key).toMatch(/\.bmp$/);
      const avif = await image(
        ftyp("avif", "mif1", "avif"),
        "a.avif",
        "image/avif",
      ).expect(201);
      expect(avif.body.data.key).toMatch(/\.avif$/);
      // Served with its real type: with nosniff, octet-stream would not render in an <img>.
      for (const [key, type] of [
        [avif.body.data.key, "image/avif"],
        [bmp.body.data.key, "image/bmp"],
      ]) {
        const res = await http
          .get(`/api/v1/files/${key}`)
          .set(owner.auth)
          .expect(200);
        expect(res.headers["content-type"]).toBe(type);
      }
    });

    it("rejects content that does not match the declared type", async () => {
      const res = await image(PNG, "photo.jpg", "image/jpeg").expect(400);
      expect(res.body.message).toMatch(/isn't supported/);
    });

    it("keeps HEIC and SVG out of the body", async () => {
      await image(
        ftyp("heic", "mif1", "heic"),
        "IMG_1.HEIC",
        "image/heic",
      ).expect(400);
      await image(Buffer.from("<svg/>"), "logo.svg", "image/svg+xml").expect(
        400,
      );
    });

    it("answers an image over 20 MB with the limit", async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(20 * 1024 * 1024)]);
      const res = await image(big, "big.png", "image/png");
      expect(res.status).toBe(413);
      expect(res.body.message).toBe("Images can be up to 20 MB.");
    });

    it("accepts a 6 MB image (the old limit was 5 MB)", async () => {
      await image(
        Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]),
        "six.png",
        "image/png",
      ).expect(201);
    });
  });

  describe("attached documents", () => {
    it("accepts images, HEIC and SVG as documents", async () => {
      const png = await document(PNG, "shot.png", "image/png").expect(201);
      expect(png.body.data.currentVersion.mimetype).toBe("image/png");
      const heic = await document(
        ftyp("heic", "mif1", "heic"),
        "IMG_2.HEIC",
        "",
      ).expect(201);
      expect(heic.body.data.currentVersion.mimetype).toBe("image/heic");
      await document(
        Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
        "logo.svg",
        "image/svg+xml",
      ).expect(201);
    });

    it("accepts Power BI reports and templates sent without a useful type", async () => {
      const pbix = await document(
        ZIP,
        "Sales.pbix",
        "application/octet-stream",
      ).expect(201);
      expect(pbix.body.data.currentVersion.mimetype).toBe(
        "application/vnd.ms-powerbi",
      );
      const version = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: pbix.body.data.currentVersion.id },
      });
      expect(version.key).toMatch(/\.pbix$/);
      const stored = await http
        .get(
          api(
            `/documents/${pbix.body.data.id}/versions/${pbix.body.data.currentVersion.id}/download`,
          ),
        )
        .set(owner.auth)
        .expect(200);
      // Served as the resolved type, not as what the browser declared.
      expect(stored.headers["content-type"]).toBe("application/vnd.ms-powerbi");
      const pbit = await document(ZIP, "Sales.pbit", "").expect(201);
      expect(pbit.body.data.currentVersion.mimetype).toBe(
        "application/vnd.ms-powerbi.template",
      );
    });

    it("stores a CSV that Windows declares as Excel as a CSV", async () => {
      const csv = await document(
        Buffer.from("a,b\n1,2\n"),
        "people.csv",
        "application/vnd.ms-excel",
      ).expect(201);
      expect(csv.body.data.currentVersion.mimetype).toBe("text/csv");
    });

    it("rejects unknown files with the list of types", async () => {
      const res = await document(
        Buffer.from("MZ\0\0"),
        "run.exe",
        "application/x-msdownload",
      ).expect(400);
      expect(res.body.message).toMatch(/Power BI/);
    });

    it("a new version must be the same type, whatever the browser declares", async () => {
      const first = await document(ZIP, "Model.pbix", "").expect(201);
      await http
        .post(api(`/documents/${first.body.data.id}/versions`))
        .set(owner.auth)
        .attach("file", ZIP, {
          filename: "Model v2.pbix",
          contentType: "application/octet-stream",
        })
        .expect(201);
      await http
        .post(api(`/documents/${first.body.data.id}/versions`))
        .set(owner.auth)
        .attach("file", PNG, {
          filename: "Model.png",
          contentType: "image/png",
        })
        .expect(400);
    });
  });
});

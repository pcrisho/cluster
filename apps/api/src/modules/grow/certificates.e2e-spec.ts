import { INestApplication } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hashPassword } from "../auth/password-hash";
import request from "supertest";
import { inflateSync } from "zlib";
import { accentOf } from "../../common/theme";
import { EMPTY_SEEDS } from "@cluster/theme";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { todayIn } from "./due-date";

/** Certificates: issued once on completion, the owner's PDF, and the public verification page. */
describe("GROW certificates e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let author: TestActor;
  let learner: TestActor;
  let colleague: TestActor;
  let outsider: TestActor;

  type Cert = {
    id: string;
    code: string;
    courseId: string;
    courseTitle: string;
    recipientName: string;
    organizationName: string;
    issuedOn: string;
  };

  /** A published course with lessons `steps` (the last ones optional when marked with "?"). */
  const course = async (
    data: Partial<Prisma.CourseUncheckedCreateInput> = {},
    steps = ["one", "two"],
  ) => {
    const c = await prisma.course.create({
      data: {
        organizationId: admin.orgId,
        title: "Forklift safety",
        createdById: admin.id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        ...data,
      },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: c.id, title: "S", position: 0 },
    });
    const ids: Record<string, string> = {};
    for (const [p, raw] of steps.entries())
      ids[raw.replace("?", "")] = (
        await prisma.courseStep.create({
          data: {
            courseId: c.id,
            sectionId: section.id,
            type: "LESSON",
            title: raw,
            position: p,
            required: !raw.endsWith("?"),
            content: {
              kind: "text",
              doc: { type: "doc", content: [{ type: "paragraph" }] },
            },
          },
        })
      ).id;
    return { id: c.id, steps: ids };
  };
  const complete = (who: TestActor, courseId: string, stepId: string) =>
    http
      .post(`/api/v1/grow/courses/${courseId}/steps/${stepId}/complete`)
      .set(who.auth);
  const mine = async (who: TestActor) =>
    (await http.get("/api/v1/grow/certificates").set(who.auth).expect(200))
      .body as Cert[];
  const verify = (code: string) => http.get(`/api/v1/grow/verify/${code}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "ce-admin", "ADMIN");
    author = await createActor(app, "ce-author", "COLLABORATOR", admin.orgId);
    learner = await createActor(app, "ce-learner", "COLLABORATOR", admin.orgId);
    colleague = await createActor(
      app,
      "ce-colleague",
      "COLLABORATOR",
      admin.orgId,
    );
    outsider = await createActor(app, "ce-out", "ADMIN");
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
    await prisma.user.update({
      where: { id: learner.id },
      data: { firstName: "María José", lastName: "Ñúñez" },
    });
  });

  afterAll(async () => app?.close());

  it("completing the course issues one certificate, even with parallel calls, and tells the learner", async () => {
    const c = await course();
    await complete(learner, c.id, c.steps.one).expect(200);
    await Promise.all([
      complete(learner, c.id, c.steps.two),
      complete(learner, c.id, c.steps.two),
    ]);
    expect(
      await prisma.certificate.count({
        where: { courseId: c.id, userId: learner.id },
      }),
    ).toBe(1);

    const [cert] = (await mine(learner)).filter((x) => x.courseId === c.id);
    expect(cert).toMatchObject({
      recipientName: "María José Ñúñez",
      courseTitle: "Forklift safety",
    });
    expect(cert.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: admin.orgId },
    });
    expect(cert.organizationName).toBe(org.name);

    const overview = await http
      .get(`/api/v1/grow/courses/${c.id}`)
      .set(learner.auth)
      .expect(200);
    expect(overview.body.certificate).toMatchObject({
      id: cert.id,
      code: cert.code,
    });
    // The web writes the title in the reader's language from the values in payload.params.
    const notices = await http
      .get("/api/v1/notifications")
      .set(learner.auth)
      .expect(200);
    const issued = notices.body.data.filter(
      (n: { type: string; payload: { params?: { course?: string } } }) =>
        n.type === "grow:certificate:issued" &&
        n.payload?.params?.course === "Forklift safety",
    );
    expect(issued).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "Certificate.ISSUE", entityId: cert.id },
      }),
    ).toBe(1);
  });

  it("issues none when the course does not issue certificates", async () => {
    const c = await course({ issuesCertificate: false }, ["only"]);
    await complete(learner, c.id, c.steps.only).expect(200);
    expect(
      await prisma.enrollment.findUniqueOrThrow({
        where: { courseId_userId: { courseId: c.id, userId: learner.id } },
      }),
    ).toMatchObject({ status: "COMPLETED" });
    expect(await prisma.certificate.count({ where: { courseId: c.id } })).toBe(
      0,
    );
    const overview = await http
      .get(`/api/v1/grow/courses/${c.id}`)
      .set(learner.auth)
      .expect(200);
    expect(overview.body.certificate).toBeNull();
  });

  describe("the PDF logo", () => {
    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const pdfOf = async (title: string) => {
      const c = await course({ title }, ["only"]);
      await complete(learner, c.id, c.steps.only).expect(200);
      const cert = (await mine(learner)).find((x) => x.courseId === c.id)!;
      const res = await http
        .get(`/api/v1/grow/certificates/${cert.id}/pdf`)
        .set(learner.auth)
        .buffer(true)
        .parse((r, done) => {
          const chunks: Buffer[] = [];
          r.on("data", (d: Buffer) => chunks.push(d));
          r.on("end", () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      return (res.body as Buffer).toString("latin1");
    };
    const setLogo = (logoUrl: string | null) =>
      prisma.organization.update({
        where: { id: admin.orgId },
        data: { logoUrl },
      });
    afterEach(() => setLogo(null));

    it("carries the organization's logo, and none when it has none", async () => {
      expect(await pdfOf("No logo")).not.toContain("/Subtype /Image");

      const upload = await http
        .post("/api/v1/files/images")
        .set(admin.auth)
        .attach("file", PNG, { filename: "logo.png", contentType: "image/png" })
        .expect(201);
      await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ logoUrl: upload.body.key })
        .expect(200);
      expect(await pdfOf("With logo")).toContain("/Subtype /Image");
    });

    it("converts a GIF logo uploaded straight to the API", async () => {
      const gif = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      );
      const upload = await http
        .post("/api/v1/files/images")
        .set(admin.auth)
        .attach("file", gif, { filename: "logo.gif", contentType: "image/gif" })
        .expect(201);
      await setLogo(upload.body.key);
      expect(await pdfOf("Gif logo")).toContain("/Subtype /Image");
    });

    it("still downloads when the logo file is gone from storage", async () => {
      await setLogo(`organizations/${admin.orgId}/uploads/gone.webp`);
      expect(await pdfOf("Gone webp")).not.toContain("/Subtype /Image");
      await setLogo(`organizations/${admin.orgId}/uploads/missing.png`);
      expect(await pdfOf("Missing logo")).not.toContain("/Subtype /Image");
    });
  });

  describe("the PDF accent", () => {
    /** The stroke colours drawn in the PDF (pdfkit writes `r g b SCN` inside compressed streams). */
    const strokes = (pdf: string) => {
      const raw = Buffer.from(pdf, "latin1");
      let content = "";
      for (const m of pdf.matchAll(/stream\r?\n/g)) {
        const start = m.index + m[0].length;
        try {
          content += inflateSync(
            raw.subarray(start, pdf.indexOf("endstream", start)),
          ).toString("latin1");
        } catch {
          // not a deflated stream (fonts, images)
        }
      }
      return [...content.matchAll(/([\d.]+ [\d.]+ [\d.]+) SCN/g)].map(
        (m) => m[1],
      );
    };
    const pdfColour = (seed: string) =>
      accentOf({ ...EMPTY_SEEDS, brandPrimary: seed })!
        .slice(1)
        .match(/../g)!
        .map((h) => parseInt(h, 16) / 255)
        .join(" ");
    const pdfFor = async (title: string) => {
      const c = await course({ title }, ["only"]);
      await complete(learner, c.id, c.steps.only).expect(200);
      const cert = (await mine(learner)).find((x) => x.courseId === c.id)!;
      const res = await http
        .get(`/api/v1/grow/certificates/${cert.id}/pdf`)
        .set(learner.auth)
        .buffer(true)
        .parse((r, done) => {
          const chunks: Buffer[] = [];
          r.on("data", (d: Buffer) => chunks.push(d));
          r.on("end", () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      return strokes((res.body as Buffer).toString("latin1"));
    };
    const settings = (data: Prisma.InstanceSettingsUpdateInput) =>
      prisma.instanceSettings.update({ where: { id: 1 }, data });
    const orgTheme = (data: Prisma.OrganizationUpdateInput) =>
      prisma.organization.update({ where: { id: admin.orgId }, data });
    afterEach(async () => {
      await settings({ brandPrimary: null, orgThemingAllowed: false });
      await orgTheme({ brandPrimary: null, themingEnabled: true });
    });

    it("follows the organization theme only while both switches allow it", async () => {
      await settings({ brandPrimary: "#1f2a44" });
      await orgTheme({ brandPrimary: "#00c853" });
      expect(await pdfFor("Master off")).toContain(pdfColour("#1f2a44"));

      await settings({ orgThemingAllowed: true });
      const both = await pdfFor("Both on");
      expect(both).toContain(pdfColour("#00c853"));
      expect(both).not.toContain(pdfColour("#1f2a44"));

      await orgTheme({ themingEnabled: false });
      expect(await pdfFor("Org off")).toContain(pdfColour("#1f2a44"));
    });
  });

  it("a rename of the organization does not rewrite a certificate already issued", async () => {
    const c = await course({ title: "Renames" }, ["only"]);
    await complete(learner, c.id, c.steps.only).expect(200);
    const cert = (await mine(learner)).find((x) => x.courseId === c.id)!;
    await prisma.organization.update({
      where: { id: admin.orgId },
      data: { name: "Renamed After Issue" },
    });
    const after = (await mine(learner)).find((x) => x.id === cert.id)!;
    expect(after.organizationName).toBe(cert.organizationName);
    expect(after.organizationName).not.toBe("Renamed After Issue");
    const verified = await http
      .get(`/api/v1/grow/verify/${cert.code}`)
      .expect(200);
    expect(verified.body.organizationName).toBe(cert.organizationName);
  });

  it("a completion caused by an outline edit issues the certificate too", async () => {
    const c = await course({}, ["one", "two"]);
    await complete(learner, c.id, c.steps.one).expect(200);
    await http
      .patch(`/api/v1/grow/steps/${c.steps.two}`)
      .set(author.auth)
      .send({ required: false })
      .expect(200);
    expect(
      await prisma.certificate.count({
        where: { courseId: c.id, userId: learner.id },
      }),
    ).toBe(1);
  });

  it("the PDF is for its owner only", async () => {
    const c = await course({ title: "Ladders" }, ["only"]);
    await complete(learner, c.id, c.steps.only).expect(200);
    const cert = (await mine(learner)).find((x) => x.courseId === c.id)!;
    const pdf = await http
      .get(`/api/v1/grow/certificates/${cert.id}/pdf`)
      .set(learner.auth)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (d: Buffer) => chunks.push(d));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toMatch(/^attachment;/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    await http
      .get(`/api/v1/grow/certificates/${cert.id}/pdf`)
      .set(colleague.auth)
      .expect(404);
    await http
      .get(`/api/v1/grow/certificates/${cert.id}/pdf`)
      .set(admin.auth)
      .expect(404);
    await http
      .get(`/api/v1/grow/certificates/${cert.id}/pdf`)
      .set(outsider.auth)
      .expect(404);
    expect((await mine(colleague)).map((x) => x.id)).not.toContain(cert.id);
    expect((await mine(outsider)).map((x) => x.id)).not.toContain(cert.id);
  });

  it("the PDF also downloads with the file cookie a plain link carries", async () => {
    const c = await course({ title: "Scaffolds" }, ["only"]);
    await complete(learner, c.id, c.steps.only).expect(200);
    const cert = (await mine(learner)).find((x) => x.courseId === c.id)!;
    const user = await prisma.user.update({
      where: { id: learner.id },
      data: { passwordHash: await hashPassword("Secret1234", 4) },
    });
    const login = await http
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "Secret1234" })
      .expect(200);
    const cookie = ([] as string[])
      .concat(login.headers["set-cookie"] ?? [])
      .find((x) => x.startsWith("cluster_files="))!
      .split(";")[0];
    await http
      .get(`/api/v1/grow/certificates/${cert.id}/pdf`)
      .set("Cookie", cookie)
      .expect(200)
      .expect("Content-Type", "application/pdf");
  });

  it("the certificate is dated by the organization's zone and keeps that date", async () => {
    // Kiritimati (UTC+14) and Pago Pago (UTC-11) are always on different calendar dates.
    const datedIn = async (timezone: string) => {
      await prisma.organization.update({
        where: { id: admin.orgId },
        data: { timezone },
      });
      const c = await course({ title: `Dated in ${timezone}` }, ["only"]);
      await complete(learner, c.id, c.steps.only).expect(200);
      return (await mine(learner)).find((x) => x.courseId === c.id)!;
    };
    try {
      const east = await datedIn("Pacific/Kiritimati");
      const west = await datedIn("Pacific/Pago_Pago");
      expect(east.issuedOn).toBe(todayIn("Pacific/Kiritimati"));
      expect(west.issuedOn).toBe(todayIn("Pacific/Pago_Pago"));
      expect(east.issuedOn).not.toBe(west.issuedOn);
      expect((await verify(east.code).expect(200)).body.issuedOn).toBe(
        east.issuedOn,
      );

      // The date stays as issued when the organization later changes its zone.
      await prisma.organization.update({
        where: { id: admin.orgId },
        data: { timezone: "UTC" },
      });
      expect(
        (await mine(learner)).find((x) => x.id === east.id)!.issuedOn,
      ).toBe(east.issuedOn);
    } finally {
      await prisma.organization.update({
        where: { id: admin.orgId },
        data: { timezone: "UTC" },
      });
    }
  });

  it("anyone can verify a code and sees only the minimum, as issued, even after the course is archived", async () => {
    const c = await course({ title: "Hot work permits" }, ["only"]);
    await complete(learner, c.id, c.steps.only).expect(200);
    const cert = (await mine(learner)).find((x) => x.courseId === c.id)!;

    await prisma.course.update({
      where: { id: c.id },
      data: { status: "ARCHIVED", title: "Renamed later" },
    });
    const shown = await verify(cert.code.toLowerCase()).expect(200);
    expect(shown.body).toEqual({
      recipientName: "María José Ñúñez",
      courseTitle: "Hot work permits",
      organizationName: cert.organizationName,
      issuedOn: cert.issuedOn,
      code: cert.code,
    });
    await verify(cert.code.replace(/-/g, "")).expect(200);
    await verify("ZZZZ-ZZZZ-ZZZZ").expect(404);
    await verify("not-a-code").expect(404);
  });

  it("verification is rate limited per client", async () => {
    let status = 200;
    for (let i = 0; i < 40 && status !== 429; i++)
      status = (await verify("ZZZZ-ZZZZ-ZZZZ")).status;
    expect(status).toBe(429);
  });
});

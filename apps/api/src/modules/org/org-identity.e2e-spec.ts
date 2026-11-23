import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

// 1x1 transparent PNG (passes magic-byte validation)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Name, logo, language and activity of the organization (ADMIN only, own organization only). */
describe("Organization identity e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let member: TestActor;
  let other: TestActor;

  const upload = async (actor: TestActor) => {
    const res = await http
      .post("/api/v1/files/images")
      .set(actor.auth)
      .attach("file", PNG, { filename: "logo.png", contentType: "image/png" })
      .expect(201);
    return res.body.key as string;
  };
  const org = (id: string) =>
    prisma.organization.findUniqueOrThrow({ where: { id } });
  const setInstanceLocale = (defaultLocale: string) =>
    prisma.instanceSettings.update({
      where: { id: 1 },
      data: { defaultLocale },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "ident-admin", "ADMIN");
    member = await createActor(
      app,
      "ident-member",
      "COLLABORATOR",
      admin.orgId,
    );
    other = await createActor(app, "ident-other", "ADMIN");
  });

  afterAll(async () => {
    await setInstanceLocale("en");
    await app.close();
  });

  describe("name", () => {
    const unique = () => Math.random().toString(36).slice(2, 8)

    it("a rename shows everywhere, trimmed, and the identifier follows the name", async () => {
      const fresh = await createActor(app, "ident-name", "ADMIN")
      const tag = unique()
      const res = await http.patch("/api/v1/org").set(fresh.auth).send({ name: `  Compañía Ñandú ${tag}  ` }).expect(200)
      expect(res.body).toMatchObject({ name: `Compañía Ñandú ${tag}`, slug: `compania-nandu-${tag}` })

      const me = await http.get("/api/v1/auth/me").set(fresh.auth).expect(200)
      expect(me.body.user.organization).toMatchObject({ name: `Compañía Ñandú ${tag}`, slug: `compania-nandu-${tag}` })
      expect(await org(fresh.orgId)).toMatchObject({ name: `Compañía Ñandú ${tag}`, slug: `compania-nandu-${tag}` })
    })

    it("the audit entry records the identifier before and after", async () => {
      const fresh = await createActor(app, "ident-slug-audit", "ADMIN")
      const before = (await org(fresh.orgId)).slug
      const tag = unique()
      await http.patch("/api/v1/org").set(fresh.auth).send({ name: `Renamed ${tag}` }).expect(200)
      const row = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: fresh.orgId } })
      expect(row.oldValues).toMatchObject({ slug: before })
      expect(row.newValues).toMatchObject({ name: `Renamed ${tag}`, slug: `renamed-${tag}` })
    })

    it("a change that does not alter the identifier keeps it, and never clashes with itself", async () => {
      const fresh = await createActor(app, "ident-same-slug", "ADMIN")
      const tag = unique()
      await http.patch("/api/v1/org").set(fresh.auth).send({ name: `Same Name ${tag}` }).expect(200)
      await http.patch("/api/v1/org").set(fresh.auth).send({ name: `SAME  name ${tag}!` }).expect(200)
      expect((await org(fresh.orgId)).slug).toBe(`same-name-${tag}`)
    })

    it("refuses a name whose identifier belongs to another organization", async () => {
      const first = await createActor(app, "ident-clash-a", "ADMIN")
      const second = await createActor(app, "ident-clash-b", "ADMIN")
      const tag = unique()
      await http.patch("/api/v1/org").set(first.auth).send({ name: `Clash ${tag}` }).expect(200)
      const before = await org(second.orgId)

      const res = await http.patch("/api/v1/org").set(second.auth).send({ name: `CLASH ${tag}` }).expect(409)
      expect(res.body.code).toBe("ORG_NAME_TAKEN")
      expect(await org(second.orgId)).toMatchObject({ name: before.name, slug: before.slug })
    })

    it("a name with no Latin letters is accepted and the identifier stays", async () => {
      const fresh = await createActor(app, "ident-cjk", "ADMIN")
      const before = (await org(fresh.orgId)).slug
      await http.patch("/api/v1/org").set(fresh.auth).send({ name: "株式会社" }).expect(200)
      expect(await org(fresh.orgId)).toMatchObject({ name: "株式会社", slug: before })
    })

    it("refuses an empty or blank name and keeps the current one", async () => {
      const fresh = await createActor(app, "ident-blank", "ADMIN")
      const before = (await org(fresh.orgId)).name
      for (const name of ["", "   ", "\t\n", "x".repeat(101)]) {
        await http.patch("/api/v1/org").set(fresh.auth).send({ name }).expect(400)
      }
      expect((await org(fresh.orgId)).name).toBe(before)
    })
  })

  describe("logo", () => {
    it("an ADMIN sets the logo and every member gets it with the session", async () => {
      const key = await upload(admin);
      const res = await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ logoUrl: key })
        .expect(200);
      expect(res.body.logoUrl).toBe(key);
      expect((await org(admin.orgId)).logoUrl).toBe(key);

      const me = await http.get("/api/v1/auth/me").set(member.auth).expect(200);
      expect(me.body.user.organization.logoUrl).toBe(key);
    });

    it("refuses a key of another organization, an outside URL and a key that is not an upload", async () => {
      const foreign = await upload(other);
      const before = (await org(admin.orgId)).logoUrl;
      for (const logoUrl of [
        foreign,
        "https://evil.example/pixel.png",
        "organizations/x/../y.png",
        "logo.png",
        "",
      ]) {
        await http
          .patch("/api/v1/org")
          .set(admin.auth)
          .send({ logoUrl })
          .expect(400);
      }
      expect((await org(admin.orgId)).logoUrl).toBe(before);
    });

    it("replacing or removing the logo deletes the previous file", async () => {
      const first = await upload(admin);
      await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ logoUrl: first })
        .expect(200);
      const second = await upload(admin);
      await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ logoUrl: second })
        .expect(200);
      await http.get(`/api/v1/files/${first}`).set(admin.auth).expect(404);
      await http.get(`/api/v1/files/${second}`).set(member.auth).expect(200);

      await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ logoUrl: null })
        .expect(200);
      expect((await org(admin.orgId)).logoUrl).toBeNull();
      await http.get(`/api/v1/files/${second}`).set(admin.auth).expect(404);
    });

    it("only an ADMIN of the organization changes it", async () => {
      const key = await upload(member);
      await http
        .patch("/api/v1/org")
        .set(member.auth)
        .send({ logoUrl: key })
        .expect(403);

      const otherKey = await upload(other);
      await http
        .patch("/api/v1/org")
        .set(other.auth)
        .send({ logoUrl: otherKey })
        .expect(200);
      expect((await org(admin.orgId)).logoUrl).not.toBe(otherKey);
    });
  });

  describe("avatar", () => {
    it("a profile picture must be an upload of the person's organization", async () => {
      const foreign = await upload(other);
      for (const avatarUrl of [foreign, "https://evil.example/pixel.png"]) {
        await http
          .patch("/api/v1/auth/me")
          .set(member.auth)
          .send({ avatarUrl })
          .expect(400);
      }
      const own = await upload(member);
      await http
        .patch("/api/v1/auth/me")
        .set(member.auth)
        .send({ avatarUrl: own })
        .expect(200);
      await http
        .patch("/api/v1/auth/me")
        .set(member.auth)
        .send({ avatarUrl: null })
        .expect(200);
    });
  });

  describe("language", () => {
    afterEach(async () => {
      await setInstanceLocale("en");
      await prisma.organization.update({
        where: { id: admin.orgId },
        data: { locale: null },
      });
      await prisma.user.update({
        where: { id: member.id },
        data: { locale: null },
      });
    });

    const effective = async () =>
      (await http.get("/api/v1/auth/me").set(member.auth).expect(200)).body.user
        .effectiveLocale;

    it("a person follows their organization, then the instance, unless they chose one", async () => {
      await setInstanceLocale("en");
      expect(await effective()).toBe("en");

      await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ locale: "es" })
        .expect(200);
      expect(await effective()).toBe("es");

      await prisma.user.update({
        where: { id: member.id },
        data: { locale: "en" },
      });
      expect(await effective()).toBe("en");
      await prisma.user.update({
        where: { id: member.id },
        data: { locale: null },
      });

      await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ locale: null })
        .expect(200);
      await setInstanceLocale("es");
      expect(await effective()).toBe("es");
    });

    it("accepts only a supported language and only from an ADMIN", async () => {
      await http
        .patch("/api/v1/org")
        .set(admin.auth)
        .send({ locale: "fr" })
        .expect(400);
      await http
        .patch("/api/v1/org")
        .set(member.auth)
        .send({ locale: "es" })
        .expect(403);
      expect((await org(admin.orgId)).locale).toBeNull();
    });
  });

  describe("summary", () => {
    it("shows the slug, the creation date and the active members", async () => {
      const inactive = await createActor(
        app,
        "ident-inactive",
        "COLLABORATOR",
        admin.orgId,
      );
      await prisma.user.update({
        where: { id: inactive.id },
        data: { isActive: false },
      });
      const res = await http.get("/api/v1/org").set(admin.auth).expect(200);
      const active = await prisma.user.count({
        where: { organizationId: admin.orgId, isActive: true },
      });
      expect(res.body.memberCount).toBe(active);
      expect(res.body.slug).toBe((await org(admin.orgId)).slug);
      expect(new Date(res.body.createdAt).getTime()).toBe(
        (await org(admin.orgId)).createdAt.getTime(),
      );
    });
  });

  describe("audit", () => {
    it("every change to the organization is recorded with before and after", async () => {
      const fresh = await createActor(app, "ident-audit", "ADMIN");
      await http
        .patch("/api/v1/org")
        .set(fresh.auth)
        .set("User-Agent", "e2e-agent")
        .send({ name: "Renamed Org", timezone: "America/Lima", locale: "es" })
        .expect(200);

      const rows = await prisma.auditLog.findMany({
        where: { organizationId: fresh.orgId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "Organization.UPDATE",
        entityType: "Organization",
        entityId: fresh.orgId,
        actorId: fresh.id,
        userAgent: "e2e-agent",
        newValues: {
          name: "Renamed Org",
          timezone: "America/Lima",
          locale: "es",
        },
      });
      expect((rows[0].oldValues as Record<string, unknown>).timezone).toBe(
        "UTC",
      );
    });

    it("a save that changes nothing leaves no entry", async () => {
      const fresh = await createActor(app, "ident-noop", "ADMIN");
      const current = await org(fresh.orgId);
      await http
        .patch("/api/v1/org")
        .set(fresh.auth)
        .send({ name: current.name, timezone: current.timezone })
        .expect(200);
      expect(
        await prisma.auditLog.count({ where: { organizationId: fresh.orgId } }),
      ).toBe(0);
    });
  });

  describe("activity", () => {
    it("lists the organization's audit log newest first, with the actor, in pages", async () => {
      const fresh = await createActor(app, "ident-activity", "ADMIN");
      for (const name of ["One", "Two", "Three"]) {
        await http
          .patch("/api/v1/org")
          .set(fresh.auth)
          .send({ name })
          .expect(200);
      }
      const first = await http
        .get("/api/v1/org/activity?limit=2")
        .set(fresh.auth)
        .expect(200);
      expect(
        first.body.items.map(
          (i: { newValues: { name: string } }) => i.newValues.name,
        ),
      ).toEqual(["Three", "Two"]);
      expect(first.body.items[0]).toMatchObject({
        action: "Organization.UPDATE",
        actor: { id: fresh.id, firstName: "ident-activity" },
      });
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await http
        .get(`/api/v1/org/activity?limit=2&cursor=${first.body.nextCursor}`)
        .set(fresh.auth)
        .expect(200);
      expect(
        second.body.items.map(
          (i: { newValues: { name: string } }) => i.newValues.name,
        ),
      ).toEqual(["One"]);
      expect(second.body.nextCursor).toBeNull();
    });

    it("never shows another organization's entries and is only for ADMINs", async () => {
      await http
        .patch("/api/v1/org")
        .set(other.auth)
        .send({ name: "Other secret rename" })
        .expect(200);
      const mine = await http
        .get("/api/v1/org/activity")
        .set(admin.auth)
        .expect(200);
      expect(JSON.stringify(mine.body)).not.toContain("Other secret rename");

      await http.get("/api/v1/org/activity").set(member.auth).expect(403);
    });
  });
});

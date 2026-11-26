import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, type TestActor } from "../../test-helpers"

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025"

/** The latest e-mail sent to `to`, as Mailpit stores it. */
async function mailTo(to: string): Promise<{ Subject: string; Text: string; HTML: string }> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string }[] }
    if (messages.length > 0) return (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json()
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No email received for ${to}`)
}

describe("Languages and organization time zone e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  let superadmin: TestActor
  let admin: TestActor
  let manager: TestActor
  let member: TestActor

  const setDefaultLocale = (defaultLocale: string) =>
    prisma.instanceSettings.update({
      where: { id: 1 },
      data: { defaultLocale },
    })

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    admin = await createActor(app, "zone-admin", "ADMIN")
    manager = await createActor(app, "zone-manager", "MANAGER", admin.orgId)
    member = await createActor(app, "zone-member", "COLLABORATOR", admin.orgId)
    superadmin = await createActor(app, "zone-super", "ADMIN")
    await prisma.user.update({
      where: { id: superadmin.id },
      data: { isSuperAdmin: true },
    })
  })

  afterEach(() => setDefaultLocale("en"))

  afterAll(async () => {
    await setDefaultLocale("en")
    await app.close()
  })

  describe("language", () => {
    it("a person with no choice follows the instance default", async () => {
      let me = await http.get("/api/v1/auth/me").set(member.auth).expect(200)
      expect(me.body.user).toMatchObject({
        locale: null,
        effectiveLocale: "en",
      })

      await setDefaultLocale("es")
      me = await http.get("/api/v1/auth/me").set(member.auth).expect(200)
      expect(me.body.user).toMatchObject({
        locale: null,
        effectiveLocale: "es",
      })
      expect(me.body.user).not.toHaveProperty("timezone")
    })

    it("a person's choice wins over the instance default and can be reset to it", async () => {
      await setDefaultLocale("es")
      const chosen = await http.patch("/api/v1/auth/me").set(member.auth).send({ locale: "en" }).expect(200)
      expect(chosen.body.user).toMatchObject({
        locale: "en",
        effectiveLocale: "en",
      })

      const reset = await http.patch("/api/v1/auth/me").set(member.auth).send({ locale: null }).expect(200)
      expect(reset.body.user).toMatchObject({
        locale: null,
        effectiveLocale: "es",
      })
    })

    it("rejects an unsupported language", async () => {
      for (const locale of ["fr", "ES", "", 5]) {
        await http.patch("/api/v1/auth/me").set(member.auth).send({ locale }).expect(400)
      }
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: member.id },
      })
      expect(user.locale).toBeNull()
    })

    it("a stored value no longer supported falls back to the instance default", async () => {
      await prisma.user.update({
        where: { id: member.id },
        data: { locale: "fr" },
      })
      const me = await http.get("/api/v1/auth/me").set(member.auth).expect(200)
      expect(me.body.user.effectiveLocale).toBe("en")
      await prisma.user.update({
        where: { id: member.id },
        data: { locale: null },
      })
    })

    it("only the superadmin changes the instance default, to a supported language", async () => {
      await http.patch("/api/v1/instance/settings").set(admin.auth).send({ defaultLocale: "es" }).expect(403)
      await http.patch("/api/v1/instance/settings").set(superadmin.auth).send({ defaultLocale: "fr" }).expect(400)
      await http.patch("/api/v1/instance/settings").set(superadmin.auth).send({ defaultLocale: "es" }).expect(200)

      const pub = await http.get("/api/v1/instance/public").expect(200)
      expect(pub.body.defaultLocale).toBe("es")
    })
  })

  describe("texts the API writes", () => {
    it("an invitation is written in the instance default, since the invitee has no language yet", async () => {
      await setDefaultLocale("es")
      const email = `zone-invitee-${Date.now()}@x.com`
      await http
        .post("/api/v1/instance/organizations")
        .set(superadmin.auth)
        .send({
          name: `Zona ${Date.now()}`,
          timezone: "America/Lima",
          admin: { email, firstName: "Lucía <b>", lastName: "A" },
        })
        .expect(201)
      const mail = await mailTo(email)
      expect(mail.Subject).toMatch(/^Te invitaron a Zona \d+ en Cluster$/)
      expect(mail.Text).toContain("Hola, Lucía <b>:")
      expect(mail.HTML).toContain("Hola, Lucía &lt;b&gt;:")
      expect(mail.HTML).toContain("Define tu contraseña")
    })

    it("a password reset is written in the person's own language", async () => {
      const person = await createActor(app, "zone-reset", "COLLABORATOR", admin.orgId)
      const { email } = await prisma.user.update({ where: { id: person.id }, data: { locale: "es" } })
      await http.post("/api/v1/auth/forgot-password").send({ email }).expect(204)
      expect((await mailTo(email)).Subject).toBe("Restablece tu contraseña de Cluster")
    })

    it("the compliance CSV is in the downloader's language", async () => {
      const csv = async () =>
        (await http.get("/api/v1/grow/reports/compliance/export").set(admin.auth).expect(200)).text.slice(1)
      expect(await csv()).toMatch(/^Person,Email,Area,Position,Course,Status,Progress,Due date,Completed/)

      await prisma.user.update({ where: { id: admin.id }, data: { locale: "es" } })
      try {
        expect(await csv()).toMatch(/^Persona,Correo,Área,Puesto,Curso,Estado,Avance,Fecha límite,Completado/)
      } finally {
        await prisma.user.update({ where: { id: admin.id }, data: { locale: null } })
      }
    })
  })

  describe("organization time zone", () => {
    it("is part of the signed-in person's organization", async () => {
      await prisma.organization.update({
        where: { id: admin.orgId },
        data: { timezone: "America/Lima" },
      })
      const me = await http.get("/api/v1/auth/me").set(member.auth).expect(200)
      expect(me.body.user.organization.timezone).toBe("America/Lima")
    })

    it("an ADMIN sets it to an IANA zone; anything else is rejected", async () => {
      await http.patch("/api/v1/org").set(admin.auth).send({ timezone: "America/Mexico_City" }).expect(200)
      for (const timezone of ["Mars/Olympus", "UTC+5", "+05:00", "EST", "america/lima", ""]) {
        await http.patch("/api/v1/org").set(admin.auth).send({ timezone }).expect(400)
      }
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: admin.orgId },
      })
      expect(org.timezone).toBe("America/Mexico_City")
    })

    it("only an ADMIN changes it, and only for their own organization", async () => {
      await http.patch("/api/v1/org").set(manager.auth).send({ timezone: "Asia/Tokyo" }).expect(403)
      await http.patch("/api/v1/org").set(member.auth).send({ timezone: "Asia/Tokyo" }).expect(403)

      // An ADMIN of another organization changes theirs, never this one.
      const other = await createActor(app, "zone-other-admin", "ADMIN")
      await http.patch("/api/v1/org").set(other.auth).send({ timezone: "Asia/Tokyo" }).expect(200)
      const mine = await prisma.organization.findUniqueOrThrow({
        where: { id: admin.orgId },
      })
      expect(mine.timezone).not.toBe("Asia/Tokyo")
    })

    it("the superadmin must give a valid zone when creating an organization", async () => {
      const body = (timezone?: string) => ({
        name: `Zone tenant ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`,
        ...(timezone !== undefined && { timezone }),
        admin: {
          email: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@x.com`,
          firstName: "Z",
          lastName: "A",
        },
      })
      await http.post("/api/v1/instance/organizations").set(superadmin.auth).send(body()).expect(400)
      await http.post("/api/v1/instance/organizations").set(superadmin.auth).send(body("UTC+5")).expect(400)

      const created = await http
        .post("/api/v1/instance/organizations")
        .set(superadmin.auth)
        .send(body("America/Bogota"))
        .expect(201)
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: created.body.organization.id },
      })
      expect(org.timezone).toBe("America/Bogota")
    })
  })
})

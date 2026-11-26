import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

describe("KNOW markdown import and export e2e", () => {
  let app: INestApplication
  let http: ReturnType<typeof request>
  let manager: TestActor
  let other: TestActor
  let space: string
  let otherSpace: string

  const api = (p: string) => `/api/v1/know${p}`
  const mkSpace = async (a: TestActor, name: string) =>
    (await http.post(api("/spaces")).set(a.auth).send({ name }).expect(201)).body.data.id as string
  const importMd = (a: TestActor, spaceId: string, body: object) =>
    http.post(api(`/spaces/${spaceId}/pages/import`)).set(a.auth).send(body)

  beforeAll(async () => {
    app = await createTestApp()
    http = request(app.getHttpServer())
    const prisma = app.get(SystemPrismaService)
    manager = await createActor(app, "md-mgr", "MANAGER")
    other = await createActor(app, "md-other", "MANAGER")
    await prisma.userCapability.createMany({
      data: [manager, other].map((a) => ({ userId: a.id, capability: "KNOW_SPACE_CREATE" as const, grantedById: a.id })),
    })
    space = await mkSpace(manager, "Markdown")
    otherSpace = await mkSpace(other, "Other markdown")
  })

  afterAll(async () => app?.close())

  describe("import", () => {
    it("creates a draft page, taking the title from a leading heading", async () => {
      const res = await importMd(manager, space, { markdown: "# Onboarding\n\nHello **team**", title: "ignored.md" }).expect(201)
      expect(res.body.data).toMatchObject({ title: "Onboarding", status: "DRAFT", spaceId: space })
      expect(res.body.dropped).toEqual([])
      const page = await http.get(api(`/pages/${res.body.data.id}`)).set(manager.auth).expect(200)
      expect(page.body.data.content.content[0].content).toEqual([
        { type: "text", text: "Hello " },
        { type: "text", text: "team", marks: [{ type: "bold" }] },
      ])
      const versions = await http.get(api(`/pages/${res.body.data.id}/versions`)).set(manager.auth).expect(200)
      expect(versions.body.data).toHaveLength(1)
    })

    it("falls back to the given title and reports what it dropped", async () => {
      const res = await importMd(manager, space, {
        markdown: "plain [x](ftp://a/b) ![i](http://insecure/i.png)",
        title: "notes",
      }).expect(201)
      expect(res.body.data.title).toBe("notes")
      expect(res.body.dropped.sort()).toEqual([
        "images that are not https links",
        "links that are not http, https or mailto",
      ])
    })

    it("answers 400 for HTML, for a parent outside the space and for a body that is too long", async () => {
      await importMd(manager, space, { markdown: "<script>alert(1)</script>" }).expect(400)
      await importMd(manager, space, { markdown: "a <b>b</b> c" }).expect(400)
      const foreign = (await importMd(other, otherSpace, { markdown: "x" }).expect(201)).body.data.id
      await importMd(manager, space, { markdown: "x", parentId: foreign }).expect(400)
      await importMd(manager, space, { markdown: "x".repeat(500_001) }).expect(400)
      await importMd(manager, space, {}).expect(400)
    })

    it("accepts a large document", async () => {
      const big = Array.from({ length: 4000 }, (_, i) => `Paragraph number ${i} with some words in it.`).join("\n\n")
      expect(big.length).toBeGreaterThan(150_000)
      await importMd(manager, space, { markdown: big }).expect(201)
    })

    it("cannot import into another organization's space", async () => {
      await importMd(manager, otherSpace, { markdown: "x" }).expect(404)
    })
  })

  describe("export", () => {
    it("writes the page as Markdown with its title and names what it could not carry", async () => {
      const created = await http
        .post(api(`/spaces/${space}/pages`))
        .set(manager.auth)
        .send({
          title: "Policy Compañía",
          status: "PUBLISHED",
          content: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Rules", marks: [{ type: "underline" }] }] },
              { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
            ],
          },
        })
        .expect(201)
      const res = await http.get(api(`/pages/${created.body.data.id}/export`)).set(manager.auth).expect(200)
      expect(res.body.data).toEqual({
        filename: "policy-compania.md",
        markdown: "# Policy Compañía\n\nRules\n\n- one\n",
        lost: ["underline"],
      })
    })

    it("an imported page exports back to the same text", async () => {
      const source = "# Round trip\n\nSome *text* with a [link](https://example.com).\n\n- [x] done\n- [ ] todo\n"
      const id = (await importMd(manager, space, { markdown: source }).expect(201)).body.data.id
      const res = await http.get(api(`/pages/${id}/export`)).set(manager.auth).expect(200)
      expect(res.body.data.markdown).toBe(source)
    })

    it("another organization's page answers 404", async () => {
      const id = (await importMd(other, otherSpace, { markdown: "# secret" }).expect(201)).body.data.id
      await http.get(api(`/pages/${id}/export`)).set(manager.auth).expect(404)
    })
  })
})

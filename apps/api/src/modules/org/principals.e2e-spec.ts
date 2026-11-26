import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

/** People, areas and positions to grant something to (KNOW sharing, GROW assignments). */
describe("Principals search e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let member: TestActor;
  let outsider: TestActor;

  type Hit = { type: string; id: string; name: string; detail?: string };
  const search = async (who: TestActor, q: string) =>
    (
      await http
        .get(`/api/v1/org/principals?q=${encodeURIComponent(q)}`)
        .set(who.auth)
        .expect(200)
    ).body as Hit[];
  const labels = (hits: Hit[]) => hits.map((h) => `${h.type}:${h.name}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "pr-admin", "ADMIN");
    member = await createActor(app, "pr-member", "COLLABORATOR", admin.orgId);
    outsider = await createActor(app, "pr-out", "ADMIN");

    await prisma.user.update({
      where: { id: member.id },
      data: { firstName: "Quincy" },
    });
    const quality = await prisma.orgNode.create({
      data: { name: "Quality", organizationId: admin.orgId },
    });
    await prisma.position.create({
      data: {
        name: "Quality auditor",
        organizationId: admin.orgId,
        createdById: admin.id,
      },
    });
    await prisma.position.create({
      data: {
        name: "Quality lead",
        organizationId: admin.orgId,
        orgNodeId: quality.id,
        createdById: admin.id,
      },
    });
  });

  afterAll(async () => app?.close());

  it("finds users, areas and positions of the caller's organization, for any member", async () => {
    const hits = await search(member, "qu");
    expect(labels(hits)).toEqual(
      expect.arrayContaining([
        "USER:Quincy Test",
        "ORG_NODE:Quality",
        "POSITION:Quality auditor",
      ]),
    );
    expect(hits.find((h) => h.type === "USER")?.detail).toMatch(/@/);
    expect(hits.every((h) => h.id)).toBe(true);
  });

  it("names the area of a position that belongs to one", async () => {
    const hits = await search(admin, "quality");
    const position = (name: string) =>
      hits.find((h) => h.type === "POSITION" && h.name === name);
    expect(position("Quality lead")?.detail).toBe("Quality");
    expect(position("Quality auditor")?.detail).toBeUndefined();
  });

  it("leaves out inactive users, archived areas and inactive positions", async () => {
    const gone = await createActor(app, "pr-gone", "COLLABORATOR", admin.orgId);
    await prisma.user.update({
      where: { id: gone.id },
      data: { firstName: "Qubert", isActive: false },
    });
    await prisma.orgNode.create({
      data: {
        name: "Quarry (old)",
        organizationId: admin.orgId,
        isActive: false,
        archivedAt: new Date(),
      },
    });
    await prisma.position.create({
      data: {
        name: "Quartermaster",
        organizationId: admin.orgId,
        createdById: admin.id,
        isActive: false,
      },
    });

    const found = labels(await search(admin, "qu"));
    expect(found).not.toContain("USER:Qubert Test");
    expect(found).not.toContain("ORG_NODE:Quarry (old)");
    expect(found).not.toContain("POSITION:Quartermaster");
  });

  it("never returns another organization's principals", async () => {
    const found = labels(await search(outsider, "qu"));
    expect(found).not.toContain("USER:Quincy Test");
    expect(found).not.toContain("ORG_NODE:Quality");
    expect(found).not.toContain("POSITION:Quality auditor");
  });

  it("needs a signed-in user", async () => {
    await http.get("/api/v1/org/principals?q=qu").expect(401);
  });
});

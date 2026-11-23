import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

type Row = { id: string; firstName: string; lastName: string; role: string };

/** `GET /org/members`: one page at a time, filtered and sorted by the server, own organization only. */
describe("Members list e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let other: TestActor;

  const person = (
    orgId: string,
    firstName: string,
    lastName: string,
    extra: Partial<{
      role: "ADMIN" | "MANAGER" | "COLLABORATOR";
      isActive: boolean;
      passwordSetAt: Date | null;
    }> = {},
  ) =>
    prisma.user.create({
      data: {
        email: `${firstName}.${lastName}.${Math.random().toString(36).slice(2, 8)}@x.com`.toLowerCase(),
        passwordHash: "x",
        firstName,
        lastName,
        role: extra.role ?? "COLLABORATOR",
        isActive: extra.isActive ?? true,
        passwordSetAt: extra.passwordSetAt === undefined ? new Date() : extra.passwordSetAt,
        organizationId: orgId,
      },
    });

  const list = (query: Record<string, string | number>) =>
    http.get("/api/v1/org/members").query(query).set(admin.auth);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "list-admin", "ADMIN");
    other = await createActor(app, "list-other", "ADMIN");
    await prisma.user.update({ where: { id: admin.id }, data: { firstName: "Zed", passwordSetAt: new Date() } });
    await person(admin.orgId, "Ana", "Perez");
    await person(admin.orgId, "Ana", "Quispe", { role: "MANAGER" });
    await person(admin.orgId, "Beto", "Rojas", { passwordSetAt: null });
    await person(admin.orgId, "Carla", "Soto", { isActive: false });
    await person(other.orgId, "Ana", "Foreign");
  });

  afterAll(() => app.close());

  it("answers a page with total, page and pageSize, in name order", async () => {
    const res = await list({ pageSize: 2 }).expect(200);
    expect(res.body).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(res.body.items.map((m: Row) => m.firstName)).toEqual(["Ana", "Ana"]);

    const last = await list({ pageSize: 2, page: 3 }).expect(200);
    expect(last.body.items.map((m: Row) => m.firstName)).toEqual(["Zed"]);
    // A page past the end lands on the last one, like the course list.
    const beyond = await list({ pageSize: 2, page: 99 }).expect(200);
    expect(beyond.body.page).toBe(3);
  });

  it("searches every word in the name or the e-mail", async () => {
    const byName = await list({ q: "ana per" }).expect(200);
    expect(byName.body.items.map((m: Row) => m.lastName)).toEqual(["Perez"]);
    const byMail = await list({ q: "beto.rojas" }).expect(200);
    expect(byMail.body.items.map((m: Row) => m.lastName)).toEqual(["Rojas"]);
  });

  it("filters by state: active, pending an invitation, deactivated", async () => {
    const names = async (status: string) =>
      (await list({ status }).expect(200)).body.items.map((m: Row) => m.firstName).sort();
    expect(await names("ACTIVE")).toEqual(["Ana", "Ana", "Zed"]);
    expect(await names("PENDING")).toEqual(["Beto"]);
    expect(await names("DEACTIVATED")).toEqual(["Carla"]);
    // Not deactivated: the active and the ones who have not set a password yet.
    expect(await names("ENABLED")).toEqual(["Ana", "Ana", "Beto", "Zed"]);
  });

  it("sorts by role and reverses the order", async () => {
    const asc = await list({ sort: "role", order: "asc" }).expect(200);
    const desc = await list({ sort: "role", order: "desc" }).expect(200);
    const roles = (r: request.Response) => r.body.items.map((m: Row) => m.role);
    expect(roles(asc)[0]).toBe("ADMIN");
    expect(roles(desc)[0]).toBe("COLLABORATOR");
    const byName = await list({ sort: "name", order: "desc" }).expect(200);
    expect(byName.body.items[0].firstName).toBe("Zed");
  });

  it("filters by the area a person belongs to", async () => {
    const node = await prisma.orgNode.create({
      data: { name: "Ops", organizationId: admin.orgId },
    });
    const ana = await prisma.user.findFirstOrThrow({
      where: { organizationId: admin.orgId, lastName: "Perez" },
    });
    await prisma.userProfile.create({
      data: { userId: ana.id, organizationId: admin.orgId, orgNodeId: node.id },
    });
    const res = await list({ orgNodeId: node.id }).expect(200);
    expect(res.body.items.map((m: Row) => m.id)).toEqual([ana.id]);
  });

  it("never lists another organization's people", async () => {
    const res = await list({ q: "foreign", pageSize: 50 }).expect(200);
    expect(res.body.total).toBe(0);
    const all = await list({ pageSize: 50 }).expect(200);
    expect(all.body.items.some((m: Row) => m.lastName === "Foreign")).toBe(false);
  });

  it("rejects a page size or a sort the screen cannot ask for", async () => {
    await list({ pageSize: 101 }).expect(400);
    await list({ sort: "passwordHash" }).expect(400);
    await list({ status: "BANNED" }).expect(400);
  });
});

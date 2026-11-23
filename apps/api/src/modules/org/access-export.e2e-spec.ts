import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

const PASSWORD = "Quiet-harbor-2026";

/** The workbook as bytes; an error answer (JSON) stays readable as an object. */
const binary = (
  res: request.Response,
  cb: (err: Error | null, body: unknown) => void,
) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => {
    const body = Buffer.concat(chunks);
    const json = String(res.headers["content-type"] ?? "").includes("json");
    cb(null, json ? JSON.parse(body.toString("utf8")) : body);
  });
};

/** The credentials file (docs/specs/auth/access-without-mail): pending members of a subtree, with fresh credentials. */
describe("Access export (.xlsx) e2e", () => {
  let app: INestApplication;
  let db: SystemPrismaService;
  let admin: TestActor;
  let root: { id: string; name: string };
  let child: { id: string; name: string };
  let p1: { id: string; email: string };
  let p2: { id: string; email: string };
  let p1Token = "";
  let p2Password = "";

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(SystemPrismaService);
    admin = await createActor(app, "ax-admin", "ADMIN");
    const tag = Math.random().toString(36).slice(2, 7);
    root = await db.orgNode.create({
      data: { name: `Empresa ${tag}`, organizationId: admin.orgId },
    });
    child = await db.orgNode.create({
      data: {
        name: `Turno ${tag}`,
        organizationId: admin.orgId,
        parentId: root.id,
      },
    });
    const other = await db.orgNode.create({
      data: { name: `Otra ${tag}`, organizationId: admin.orgId },
    });

    const place = async (
      nodeId: string,
      opts: { active?: boolean; deactivated?: boolean } = {},
    ) => {
      const m = await createActor(
        app,
        "ax-member",
        "COLLABORATOR",
        admin.orgId,
      );
      await db.user.update({
        where: { id: m.id },
        data: {
          ...(opts.active && { passwordSetAt: new Date() }),
          ...(opts.deactivated && { isActive: false }),
        },
      });
      await db.userProfile.upsert({
        where: { userId: m.id },
        create: {
          userId: m.id,
          organizationId: admin.orgId,
          orgNodeId: nodeId,
        },
        update: { orgNodeId: nodeId },
      });
      return db.user.findUniqueOrThrow({
        where: { id: m.id },
        select: { id: true, email: true },
      });
    };
    p1 = await place(root.id);
    p2 = await place(child.id);
    await place(child.id, { active: true }); // skipped, counted
    await place(root.id, { deactivated: true }); // not exported, not counted
    await place(other.id); // outside the subtree
  });
  afterAll(() => app.close());

  const exportFile = (body: object, auth = admin.auth) =>
    request(app.getHttpServer())
      .post("/api/v1/org/access-export")
      .set(auth)
      .send(body)
      .buffer(true)
      .parse(binary);

  async function sheetOf(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    // exceljs declares its own Buffer type; the bytes are the same.
    await wb.xlsx.load(
      buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0],
    );
    return wb.worksheets[0];
  }

  it("exports the pending members of the subtree with links; counts the active ones", async () => {
    const res = await exportFile({
      nodeId: root.id,
      kind: "link",
      lifetime: 168,
    }).expect(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["x-skipped-active"]).toBe("1");

    const sheet = await sheetOf(res.body as Buffer);
    expect(sheet.getRow(1).getCell(1).value).toEqual(expect.any(String)); // the notice
    const rows = [3, 4].map((i) => sheet.getRow(i));
    const byEmail = Object.fromEntries(
      rows.map((r) => [r.getCell(3).value, r]),
    );
    expect(Object.keys(byEmail).sort()).toEqual([p1.email, p2.email].sort());
    const first = byEmail[p1.email];
    expect(first.getCell(4).value).toBe(root.name);
    expect(byEmail[p2.email].getCell(4).value).toBe(
      `${root.name} / ${child.name}`,
    );
    expect(String(first.getCell(6).value)).toMatch(/set-password\?token=/);
    const expires = new Date(String(first.getCell(7).value)).getTime();
    expect(expires).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    expect(expires).toBeLessThan(Date.now() + 8 * 24 * 3600_000);
    p1Token = new URL(String(first.getCell(6).value)).searchParams.get(
      "token",
    )!;
  });

  it("the exported link signs its person in and sets a password", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/set-password")
      .send({ token: p1Token, password: PASSWORD })
      .expect(200)
      .expect((r) => expect(r.body.accessToken).toEqual(expect.any(String)));
  });

  it("a password export gives sixteen-character passwords that start the sign-in step", async () => {
    const res = await exportFile({
      nodeId: child.id,
      kind: "password",
      lifetime: 24,
    }).expect(200);
    expect(res.headers["x-skipped-active"]).toBe("1");
    const sheet = await sheetOf(res.body as Buffer);
    const row = sheet.getRow(3);
    expect(row.getCell(3).value).toBe(p2.email);
    p2Password = String(row.getCell(6).value);
    // The organization's zone (UTC by default), named next to the time.
    expect(String(row.getCell(7).value)).toMatch(/\(UTC\)$/);
    expect(p2Password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{16}$/);
    const step = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: p2.email, password: p2Password })
      .expect(200);
    expect(step.body.mfa).toBe("PASSWORD_CHANGE");
  });

  it("a new export replaces the credential the person had: the old password stops working", async () => {
    await exportFile({ nodeId: child.id, kind: "link", lifetime: 168 }).expect(
      200,
    );
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: p2.email, password: p2Password })
      .expect(401)
      .expect((r) => expect(r.body.code).toBe("INVALID_CREDENTIALS"));
  });

  it("an area with nobody pending gives no file: 409 EXPORT_EMPTY with the active count, not audited", async () => {
    const node = await db.orgNode.create({
      data: { name: `Activos ${randomUUID()}`, organizationId: admin.orgId },
    });
    const m = await createActor(app, "ax-active", "COLLABORATOR", admin.orgId);
    await db.user.update({
      where: { id: m.id },
      data: { passwordSetAt: new Date() },
    });
    await db.userProfile.upsert({
      where: { userId: m.id },
      create: { userId: m.id, organizationId: admin.orgId, orgNodeId: node.id },
      update: { orgNodeId: node.id },
    });
    const res = await exportFile({
      nodeId: node.id,
      kind: "link",
      lifetime: 168,
    }).expect(409);
    expect(res.body).toMatchObject({
      code: "EXPORT_EMPTY",
      params: { skipped: 1 },
    });
    const logs = await db.auditLog.findMany({
      where: {
        action: "Organization.EXPORT_ACCESS",
        organizationId: admin.orgId,
      },
    });
    expect(
      logs.some(
        (l) => (l.newValues as { nodeId?: string } | null)?.nodeId === node.id,
      ),
    ).toBe(false);
  });

  it("a lifetime outside the invitation presets is refused", async () => {
    const res = await exportFile({
      nodeId: root.id,
      kind: "link",
      lifetime: 1,
    }).expect(400);
    expect(res.body.code).toBe("INVALID_LIFETIME");
  });

  it("refuses a password export over 500 people, and issues none", async () => {
    const node = await db.orgNode.create({
      data: { name: `Grande ${randomUUID()}`, organizationId: admin.orgId },
    });
    const ids = Array.from({ length: 501 }, () => randomUUID());
    await db.user.createMany({
      data: ids.map((id) => ({
        id,
        email: `bulk-${id}@x.com`,
        passwordHash: "!",
        firstName: "Bulk",
        lastName: "Member",
        role: "COLLABORATOR",
        organizationId: admin.orgId,
      })),
    });
    await db.userProfile.createMany({
      data: ids.map((id) => ({
        userId: id,
        organizationId: admin.orgId,
        orgNodeId: node.id,
      })),
    });
    const res = await exportFile({
      nodeId: node.id,
      kind: "password",
      lifetime: 24,
    }).expect(400);
    expect(res.body.code).toBe("EXPORT_TOO_LARGE");
    expect(
      await db.user.count({
        where: { id: { in: ids }, tempPasswordExpiresAt: { not: null } },
      }),
    ).toBe(0);
  });

  it("is audited with the counts, never the credentials", async () => {
    const all = await db.auditLog.findMany({
      where: {
        action: "Organization.EXPORT_ACCESS",
        organizationId: admin.orgId,
      },
    });
    const log = all.find(
      (l) => (l.newValues as { nodeId?: string } | null)?.nodeId === root.id,
    );
    expect(log).toBeDefined();
    // Both pending members of the root's subtree (p2 sits in the child area), never the active one.
    expect(log!.newValues).toMatchObject({
      kind: "link",
      lifetime: 168,
      count: 2,
    });
    expect(JSON.stringify(log)).not.toContain("set-password");
  });

  it("another organization's node is not found, and a collaborator cannot export", async () => {
    const other = await createActor(app, "ax-other");
    const foreign = await db.orgNode.create({
      data: { name: `Ajena ${randomUUID()}`, organizationId: other.orgId },
    });
    await exportFile({
      nodeId: foreign.id,
      kind: "link",
      lifetime: 168,
    }).expect(404);
    const collaborator = await createActor(
      app,
      "ax-collab",
      "COLLABORATOR",
      admin.orgId,
    );
    await exportFile(
      { nodeId: root.id, kind: "link", lifetime: 168 },
      collaborator.auth,
    ).expect(403);
  });
});

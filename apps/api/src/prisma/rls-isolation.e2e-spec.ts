import { Client } from "pg";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { withOrg } from "../common/request-context";
import { PrismaService } from "./prisma.service";
import { SystemPrismaService } from "./system-prisma.service";
import { TenantContextMissing } from "./tenant-pool";

type OrgFixture = {
  id: string;
  userId: string;
  tagId: string;
  spaceId: string;
};
type Table = { name: string; model: string; key: string };

/** The wall itself: row-level security under the ordinary client, table by table (docs/specs/org/rls). */
describe("row-level security isolates every tenant table", () => {
  const system = new SystemPrismaService();
  const app = new PrismaService();
  let a: OrgFixture;
  let b: OrgFixture;
  let tables: Table[];

  /** One row in every tenant table; children get their organization from the trigger. */
  async function buildOrg(label: string): Promise<OrgFixture> {
    const slug = `iso-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await system.organization.create({
      data: { name: slug, slug },
    });
    const organizationId = org.id;
    const user = await system.user.create({
      data: {
        email: `${slug}@x.com`,
        passwordHash: "x",
        firstName: label,
        lastName: "Iso",
        role: "ADMIN",
        organizationId,
      },
    });
    const userId = user.id;
    await system.orgNode.create({ data: { name: slug, organizationId } });
    await system.position.create({
      data: { name: slug, organizationId, createdById: userId },
    });
    await system.userProfile.create({ data: { userId } });
    await system.celebrationReaction.create({
      data: { userId, targetUserId: userId, type: "BIRTHDAY", emoji: "x" },
    });
    const post = await system.post.create({
      data: { body: "b", authorId: userId, organizationId },
    });
    await system.postLike.create({ data: { postId: post.id, userId } });
    await system.postComment.create({
      data: { postId: post.id, authorId: userId, body: "c" },
    });
    await system.postAudience.create({
      data: { postId: post.id, userId },
    });
    await system.auditLog.create({
      data: {
        actorId: userId,
        action: "X",
        entityType: "X",
        entityId: "x",
        organizationId,
      },
    });
    await system.userCapability.create({
      data: { userId, capability: "KNOW_SPACE_CREATE", grantedById: userId },
    });
    const space = await system.space.create({
      data: { name: slug, createdBy: userId, organizationId },
    });
    await system.spaceAccess.create({
      data: { spaceId: space.id, role: "VIEWER", userId, createdById: userId },
    });
    const page = await system.page.create({
      data: { spaceId: space.id, title: "p", authorId: userId },
    });
    await system.pageVersion.create({
      data: {
        pageId: page.id,
        version: 1,
        title: "p",
        content: {},
        authorId: userId,
      },
    });
    const doc = await system.document.create({
      data: { pageId: page.id, name: "d", createdById: userId },
    });
    await system.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        mimetype: "text/plain",
        size: 1,
        key: `k-${slug}`,
        authorId: userId,
      },
    });
    const tag = await system.tag.create({
      data: { name: slug, slug, organizationId },
    });
    await system.pageTag.create({ data: { pageId: page.id, tagId: tag.id } });
    await system.notification.create({
      data: { userId, type: "X", title: "t" },
    });
    const course = await system.course.create({
      data: { title: slug, createdById: userId, organizationId },
    });
    const section = await system.courseSection.create({
      data: { courseId: course.id, title: "s", position: 0 },
    });
    const step = await system.courseStep.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        type: "LESSON",
        title: "l",
        position: 0,
        content: {},
      },
    });
    await system.courseAssignment.create({
      data: { courseId: course.id, userId, createdById: userId },
    });
    const enrollment = await system.enrollment.create({
      data: { courseId: course.id, userId },
    });
    await system.stepProgress.create({
      data: { enrollmentId: enrollment.id, stepId: step.id },
    });
    await system.quizAttempt.create({
      data: {
        enrollmentId: enrollment.id,
        stepId: step.id,
        questions: [],
        passScore: 80,
      },
    });
    await system.certificate.create({
      data: {
        code: slug,
        organizationId,
        userId,
        courseId: course.id,
        recipientName: "r",
        courseTitle: "c",
        organizationName: "o",
        issuedOn: new Date(),
      },
    });
    return { id: organizationId, userId, tagId: tag.id, spaceId: space.id };
  }

  const ownRows = async (table: string, orgId: string) =>
    Number(
      (
        await system.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "${table}" WHERE ${table === "Organization" ? '"id"' : '"organizationId"'} = $1`,
          orgId,
        )
      )[0].n,
    );

  beforeAll(async () => {
    await app.onModuleInit();
    const found = await system.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name
      FROM pg_attribute at
      JOIN pg_class c ON c.oid = at.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE at.attname = 'organizationId' AND n.nspname = 'public' AND c.relkind = 'r' AND NOT at.attisdropped`;
    const models = Prisma.dmmf.datamodel.models;
    tables = [...found.map((r) => r.name), "Organization"]
      .sort()
      .map((name) => {
        const model = models.find((m) => (m.dbName ?? m.name) === name)?.name;
        if (!model) throw new Error(`No Prisma model for table ${name}`);
        return { name, model, key: model[0].toLowerCase() + model.slice(1) };
      });
    a = await buildOrg("a");
    b = await buildOrg("b");
  }, 60000);

  afterAll(async () => {
    await app.onModuleDestroy();
    await system.$disconnect();
  });

  it("finds the tenant tables in the database (not vacuous)", () => {
    expect(tables.length).toBeGreaterThanOrEqual(28);
  });

  it("has at least one row of each organization in every tenant table", async () => {
    const empty: string[] = [];
    for (const t of tables)
      for (const org of [a, b])
        if ((await ownRows(t.name, org.id)) === 0)
          empty.push(`${t.name} (${org.id})`);
    expect(empty).toEqual([]);
  });

  it("raw SELECT under A returns only A's rows", async () => {
    const problems: string[] = [];
    for (const t of tables) {
      const col = t.name === "Organization" ? "id" : "organizationId";
      const rows = await withOrg(a.id, async () =>
        app.$queryRawUnsafe<Record<string, string>[]>(
          `SELECT "${col}" FROM "${t.name}"`,
        ),
      );
      if (rows.length === 0) problems.push(`${t.name}: no rows`);
      if (rows.some((r) => r[col] !== a.id))
        problems.push(`${t.name}: foreign row`);
    }
    expect(problems).toEqual([]);
  });

  it("raw UPDATE under A touches only A's rows", async () => {
    const problems: string[] = [];
    for (const t of tables) {
      const set =
        t.name === "Organization"
          ? '"name" = "name"'
          : '"organizationId" = "organizationId"';
      const touched = await withOrg(a.id, async () =>
        app.$executeRawUnsafe(`UPDATE "${t.name}" SET ${set}`),
      );
      const expected = await ownRows(t.name, a.id);
      if (touched !== expected)
        problems.push(`${t.name}: touched ${touched}, A has ${expected}`);
    }
    expect(problems).toEqual([]);
  });

  it("the model findMany with no where returns only A's rows", async () => {
    const problems: string[] = [];
    for (const t of tables) {
      const delegate = (
        app as unknown as Record<
          string,
          { findMany(): Promise<Record<string, unknown>[]> }
        >
      )[t.key];
      const rows = await withOrg(a.id, async () => delegate.findMany());
      const col = t.name === "Organization" ? "id" : "organizationId";
      if (rows.length !== (await ownRows(t.name, a.id)))
        problems.push(`${t.name}: ${rows.length} rows`);
      if (rows.some((r) => r[col] !== a.id))
        problems.push(`${t.name}: foreign row`);
    }
    expect(problems).toEqual([]);
  });

  it("refuses an insert carrying another organization's id", async () => {
    const slug = `foreign-${randomUUID()}`;
    await expect(
      withOrg(a.id, async () =>
        app.tag.create({ data: { name: slug, slug, organizationId: b.id } }),
      ),
    ).rejects.toThrow();
    expect(await system.tag.count({ where: { slug } })).toBe(0);
  });

  it("throws TenantContextMissing with no organization context", async () => {
    await expect(app.$queryRaw`SELECT 1`).rejects.toThrow(
      /No organization in the request context/,
    );
    await expect(app.$queryRaw`SELECT 1`).rejects.toBeInstanceOf(
      TenantContextMissing,
    );
  });

  describe("a bare connection as the app role, no setting", () => {
    let bare: Client;
    beforeAll(async () => {
      bare = new Client({ connectionString: process.env.DATABASE_URL });
      await bare.connect();
    });
    afterAll(async () => {
      await bare.end();
    });

    it("sees no pages", async () => {
      const { rows } = await bare.query("SELECT count(*)::int AS n FROM pages");
      expect(rows[0].n).toBe(0);
    });

    it("cannot insert a tag (policy) or a page (policy and trigger)", async () => {
      const slug = `bare-${randomUUID()}`;
      await expect(
        bare.query(
          `INSERT INTO tags ("id", "name", "slug", "organizationId") VALUES ($1, $2, $2, $3)`,
          [randomUUID(), slug, a.id],
        ),
      ).rejects.toThrow(/row-level security/);
      const id = randomUUID();
      await expect(
        bare.query(
          `INSERT INTO pages ("id", "title", "spaceId", "authorId", "organizationId", "updatedAt") VALUES ($1, 'x', $2, $3, $4, now())`,
          [id, a.spaceId, a.userId, a.id],
        ),
      ).rejects.toThrow();
      expect(await system.tag.count({ where: { slug } })).toBe(0);
      expect(await system.page.count({ where: { id } })).toBe(0);
    });
  });

  it("rolls back an interactive transaction that throws", async () => {
    const slug = `rollback-${randomUUID()}`;
    await expect(
      withOrg(a.id, async () =>
        app.$transaction(async (tx) => {
          await tx.tag.create({
            data: { name: slug, slug, organizationId: a.id },
          });
          throw new Error("boom");
        }),
      ),
    ).rejects.toThrow("boom");
    expect(await system.tag.count({ where: { slug } })).toBe(0);
  });

  it("rolls back an array transaction whose second operation targets B's row", async () => {
    const slug = `array-${randomUUID()}`;
    await expect(
      withOrg(a.id, async () =>
        app.$transaction([
          app.tag.create({ data: { name: slug, slug, organizationId: a.id } }),
          app.tag.update({
            where: { id: b.tagId },
            data: { name: "hijacked" },
          }),
        ]),
      ),
    ).rejects.toThrow();
    expect(await system.tag.count({ where: { slug } })).toBe(0);
    expect(
      (await system.tag.findUniqueOrThrow({ where: { id: b.tagId } })).name,
    ).not.toBe("hijacked");
  });
});

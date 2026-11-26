import { INestApplication } from "@nestjs/common";
import { CourseStatus, Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";
import { withOrg } from "../../common/request-context";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { CourseAccessService } from "./course-access.service";

/** The access matrix against the database: who can learn or manage which course (routes arrive in T5). */
describe("Course access e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let access: CourseAccessService;
  let admin: TestActor;
  let author: TestActor;
  let member: TestActor;
  let outsider: TestActor;
  let area: string;
  let subArea: string;
  let position: string;

  const asUser = async (actor: TestActor): Promise<AuthenticatedUser> => {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      include: { capabilities: true },
    });
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      orgId: u.organizationId,
      isSuperAdmin: u.isSuperAdmin,
      modules: ["GROW"],
      capabilities: u.capabilities.map((c) => c.capability),
      locale: "en",
    };
  };
  const course = (data: Partial<Prisma.CourseUncheckedCreateInput> = {}) =>
    prisma.course.create({
      data: {
        organizationId: admin.orgId,
        title: "Course",
        createdById: admin.id,
        ...data,
      },
    });
  const assign = (
    courseId: string,
    principal: { userId?: string; orgNodeId?: string; positionId?: string },
  ) =>
    prisma.courseAssignment.create({
      data: { courseId, createdById: admin.id, ...principal },
    });
  const outcome = async (
    actor: TestActor,
    courseId: string,
    need: "LEARN" | "MANAGE",
  ) => {
    try {
      const user = await asUser(actor);
      // The service runs inside a request in the app; here the organization is set by hand.
      await withOrg(user.orgId, () => access.requireCourse(user, courseId, need));
      return 200;
    } catch (err) {
      return (err as { status?: number }).status;
    }
  };
  const visibleIds = async (actor: TestActor) =>
    (
      await prisma.course.findMany({
        where: await (async () => {
          const user = await asUser(actor);
          return withOrg(user.orgId, () => access.visibleWhere(user));
        })(),
        select: { id: true },
      })
    ).map((c) => c.id);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    access = app.get(CourseAccessService);
    admin = await createActor(app, "ca-admin", "ADMIN");
    author = await createActor(app, "ca-author", "COLLABORATOR", admin.orgId);
    member = await createActor(app, "ca-member", "MANAGER", admin.orgId);
    outsider = await createActor(app, "ca-out", "ADMIN");
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
    area = (
      await prisma.orgNode.create({
        data: { name: "Ops", organizationId: admin.orgId },
      })
    ).id;
    subArea = (
      await prisma.orgNode.create({
        data: {
          name: "Ops north",
          organizationId: admin.orgId,
          parentId: area,
        },
      })
    ).id;
    position = (
      await prisma.position.create({
        data: {
          name: "Driver",
          organizationId: admin.orgId,
          createdById: admin.id,
        },
      })
    ).id;
  });

  afterAll(async () => app?.close());

  it("an open published course: everyone in the organization learns it, only managers manage it", async () => {
    const c = await course({ status: CourseStatus.PUBLISHED });
    expect(await outcome(member, c.id, "LEARN")).toBe(200);
    expect(await outcome(member, c.id, "MANAGE")).toBe(403);
    expect(await outcome(admin, c.id, "MANAGE")).toBe(200);
    expect(await outcome(author, c.id, "MANAGE")).toBe(200);
  });

  it("drafts and archived courses exist only for managers", async () => {
    for (const status of [CourseStatus.DRAFT, CourseStatus.ARCHIVED]) {
      const c = await course({ status });
      await assign(c.id, { userId: member.id });
      expect(await outcome(member, c.id, "LEARN")).toBe(404);
      expect(await outcome(member, c.id, "MANAGE")).toBe(404);
      expect(await outcome(author, c.id, "MANAGE")).toBe(200);
      expect(await visibleIds(member)).not.toContain(c.id);
      expect(await visibleIds(author)).toContain(c.id);
    }
  });

  it("a restricted course reaches people assigned by user, area, sub-area or position", async () => {
    const c = await course({
      status: CourseStatus.PUBLISHED,
      restricted: true,
    });
    expect(await outcome(member, c.id, "LEARN")).toBe(404);
    expect(await visibleIds(member)).not.toContain(c.id);

    await assign(c.id, { userId: member.id });
    expect(await outcome(member, c.id, "LEARN")).toBe(200);
    expect(await outcome(member, c.id, "MANAGE")).toBe(403);
    expect(await visibleIds(member)).toContain(c.id);

    const byArea = await course({
      status: CourseStatus.PUBLISHED,
      restricted: true,
    });
    await assign(byArea.id, { orgNodeId: area });
    const inSubArea = await createActor(
      app,
      "ca-sub",
      "COLLABORATOR",
      admin.orgId,
    );
    await prisma.userProfile.create({
      data: { userId: inSubArea.id, orgNodeId: subArea },
    });
    expect(await outcome(inSubArea, byArea.id, "LEARN")).toBe(200);

    const byPosition = await course({
      status: CourseStatus.PUBLISHED,
      restricted: true,
    });
    await assign(byPosition.id, { positionId: position });
    const driver = await createActor(
      app,
      "ca-driver",
      "COLLABORATOR",
      admin.orgId,
    );
    await prisma.userProfile.create({
      data: { userId: driver.id, positionId: position },
    });
    expect(await outcome(driver, byPosition.id, "LEARN")).toBe(200);
    expect(await outcome(inSubArea, byPosition.id, "LEARN")).toBe(404);
  });

  it("another organization's course does not exist, even for its admin", async () => {
    const c = await course({ status: CourseStatus.PUBLISHED });
    expect(await outcome(outsider, c.id, "LEARN")).toBe(404);
    expect(await outcome(outsider, c.id, "MANAGE")).toBe(404);
    expect(await visibleIds(outsider)).not.toContain(c.id);
    expect(
      await outcome(member, "00000000-0000-0000-0000-000000000000", "LEARN"),
    ).toBe(404);
  });

  it("an assignment points at exactly one principal", async () => {
    const c = await course();
    await expect(
      prisma.courseAssignment.create({
        data: { courseId: c.id, createdById: admin.id },
      }),
    ).rejects.toThrow();
    await expect(
      assign(c.id, { userId: member.id, positionId: position }),
    ).rejects.toThrow();
  });
});

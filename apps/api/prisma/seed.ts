import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/modules/auth/password-hash";
import { deriveAuthKey } from "../src/modules/auth/auth-keys";
import { seal } from "../src/modules/auth/secret-box";
import { extractText, markdownToDoc } from "@cluster/editor-schema";
import { readFileSync } from "fs";
import { join } from "path";
import { StorageService } from "../src/modules/storage/storage.service";
import { newCertificateCode } from "../src/modules/grow/certificate-code";

import { GLOBAL_POSITIONS } from "./seed-data/global-positions";
import { ORG_NODES } from "./seed-data/org-nodes";
import { SCOPED_POSITIONS } from "./seed-data/positions";
import { COLLABORATORS } from "./seed-data/collaborators";
import { DEMO_COURSE, SECURITY_COURSE } from "./seed-data/demo-course";
import { DEMO_SPACES } from "./seed-data/know-spaces";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_OWNER_URL!,
});
const prisma = new PrismaClient({ adapter });

/**
 * The superadmin must sign in with 2FA (docs/specs/auth/hardening R-19). In development it gets a fixed
 * TOTP secret, documented in AGENTS.md, so anyone can add it to an authenticator app; never in production.
 */
const DEV_ADMIN_TOTP_SECRET = "CLUSTERDEMOADMINTOTPSECRETKEY234";

async function seedAdminMfa(userId: string) {
  if (process.env.NODE_ENV === "production") return;
  const key = deriveAuthKey(
    "mfa-secret",
    process.env.AUTH_SECRET_KEY,
    process.env.JWT_SECRET!,
  );
  const secretBox = seal(DEV_ADMIN_TOTP_SECRET, key);
  await prisma.userMfa.upsert({
    where: { userId },
    create: { userId, secretBox, confirmedAt: new Date() },
    update: { secretBox, confirmedAt: new Date(), lastStep: null },
  });
}

async function main() {
  const orgSlug = "cluster";
  const adminEmail = "admin@cluster.example";
  // Demo accounts only (the seed never runs in production); they follow the password policy.
  const adminPassword = "Cluster-demo-2026";
  const employeePassword = "Cluster-team-2026";

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (existing) {
    console.log("Seed data already exists, skipping");
    // The password hash format changed (docs/specs/auth/hardening): keep the demo accounts usable.
    await prisma.user.update({
      where: { email: adminEmail },
      data: { passwordHash: await hashPassword(adminPassword) },
    });
    await prisma.user.updateMany({
      where: { email: { in: COLLABORATORS.map((c) => c.email) } },
      data: { passwordHash: await hashPassword(employeePassword) },
    });
    await seedAdminMfa(existing.id);
    await seedDemoContent(existing.organizationId, existing.id);
    return;
  }

  // Development and e2e keep public sign-up open (real installations start closed).
  await prisma.instanceSettings.upsert({
    where: { id: 1 },
    create: { registrationOpen: true },
    update: { registrationOpen: true },
  });

  const passwordHash = await hashPassword(adminPassword);
  const employeePasswordHash = await hashPassword(employeePassword);

  // ────────────────────────────────────────────────────────────────────────
  // 1. Organization + admin user
  // ────────────────────────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: { name: "Cluster", slug: orgSlug },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
      isSuperAdmin: true,
      passwordSetAt: new Date(),
      organizationId: org.id,
    },
  });

  await seedAdminMfa(adminUser.id);

  // ────────────────────────────────────────────────────────────────────────
  // 2. OrgNodes (the chart)
  // ────────────────────────────────────────────────────────────────────────
  const orgNodeIds = new Map<string, string>();
  for (const node of ORG_NODES) {
    const created = await prisma.orgNode.create({
      data: {
        name: node.name,
        icon: node.icon ?? null,
        sortOrder: node.sortOrder,
        parentId: node.parentKey
          ? (orgNodeIds.get(node.parentKey) ?? null)
          : null,
        organizationId: org.id,
      },
    });
    orgNodeIds.set(node.key, created.id);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 3. Global positions (CEO, C-suite, Admin, Founder)
  // ────────────────────────────────────────────────────────────────────────
  const globalPositionIds = new Map<string, string>();
  for (const gp of GLOBAL_POSITIONS) {
    const created = await prisma.position.create({
      data: {
        name: gp.name,
        description: gp.description,
        color: gp.color,
        orgNodeId: null,
        organizationId: org.id,
        createdById: adminUser.id,
      },
    });
    globalPositionIds.set(gp.name, created.id);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 4. Scoped positions (per org node)
  // ────────────────────────────────────────────────────────────────────────
  const scopedPositionIds = new Map<string, string>();
  for (const sp of SCOPED_POSITIONS) {
    const orgNodeId = orgNodeIds.get(sp.orgNodeKey);
    if (!orgNodeId) {
      throw new Error(
        `Scoped position references unknown org node: ${sp.orgNodeKey}`,
      );
    }
    const created = await prisma.position.create({
      data: {
        name: sp.name,
        description: sp.description,
        color: sp.color,
        orgNodeId,
        organizationId: org.id,
        createdById: adminUser.id,
      },
    });
    scopedPositionIds.set(sp.name, created.id);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 7. Collaborators + profiles + node/position assignments
  // ────────────────────────────────────────────────────────────────────────
  // First pass: create all users so we can resolve managerId by email
  const userIds = new Map<string, string>();
  for (const emp of COLLABORATORS) {
    const user = await prisma.user.create({
      data: {
        email: emp.email,
        passwordHash: employeePasswordHash,
        passwordSetAt: new Date(),
        firstName: emp.firstName,
        lastName: emp.lastName,
        role: emp.role,
        organizationId: org.id,
      },
    });
    userIds.set(emp.email, user.id);
  }

  // Second pass: create profiles with node + position
  for (const emp of COLLABORATORS) {
    const userId = userIds.get(emp.email);
    if (!userId) continue;

    let orgNodeId: string | null = null;
    let positionId: string | null = null;

    if (emp.globalPositionName) {
      // Global position: user belongs to root (Direccion General)
      orgNodeId = orgNodeIds.get("root") ?? null;
      positionId = globalPositionIds.get(emp.globalPositionName) ?? null;
    } else if (emp.scopedPositionName && emp.teamKey) {
      orgNodeId = orgNodeIds.get(emp.teamKey) ?? null;
      positionId = scopedPositionIds.get(emp.scopedPositionName) ?? null;
    }

    await prisma.userProfile.create({
      data: {
        userId,
        bio:
          emp.role === "ADMIN"
            ? "Platform administrator"
            : emp.role === "MANAGER"
              ? "Team lead"
              : "Team member",
        orgNodeId,
        positionId,
      },
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // 8. Assign OrgNode.managerId from COLLABORATORS entries that declare it
  //    (e.g. Carlos is the manager of the Engineering node)
  // ────────────────────────────────────────────────────────────────────────
  for (const node of ORG_NODES) {
    if (!node.managerEmail) continue;
    const nodeId = orgNodeIds.get(node.key);
    const managerId = userIds.get(node.managerEmail);
    if (!nodeId || !managerId) continue;

    await prisma.orgNode.update({
      where: { id: nodeId },
      data: { managerId },
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // 9. Admin profile (lives on the root node)
  // ────────────────────────────────────────────────────────────────────────
  await prisma.userProfile.upsert({
    where: { userId: adminUser.id },
    create: {
      userId: adminUser.id,
      bio: "Platform administrator",
      orgNodeId: orgNodeIds.get("root") ?? null,
    },
    update: {},
  });

  await seedDemoContent(org.id, adminUser.id);

  // ────────────────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────────────────
  const counts = {
    org: orgSlug,
    admin: `${adminEmail}/${adminPassword}`,
    nodes: ORG_NODES.length,
    globalPositions: GLOBAL_POSITIONS.length,
    scopedPositions: SCOPED_POSITIONS.length,
    users: COLLABORATORS.length + 1,
  };
  console.log("Seed complete:", counts);
}

/** Logo, KNOW spaces, GROW courses and progress; each part is added once (also to an existing database). */
async function seedDemoContent(organizationId: string, adminId: string) {
  await seedLogo(organizationId);
  await seedSpaces(organizationId, adminId);
  await seedDemoCourse(organizationId, adminId);
  await seedSecurityCourse(organizationId, adminId);
  await seedDemoProgress(organizationId, adminId);
}

/** The Cluster imagotype (apps/web/public/Imagotipo.svg rendered to a 512 px PNG), stored where logo uploads go. */
async function seedLogo(organizationId: string) {
  const storage = new StorageService();
  await storage.onModuleInit();
  const buffer = readFileSync(join(__dirname, "seed-data/cluster-logo.png"));
  // A fixed name under uploads/ (isOwnUploadKey): a rerun overwrites the same object.
  const key = `organizations/${organizationId}/uploads/seed-logo.png`;
  await storage.putObject(key, {
    buffer,
    size: buffer.length,
    mimetype: "image/png",
  } as Express.Multer.File);
  await prisma.organization.update({
    where: { id: organizationId },
    data: { logoUrl: key },
  });
}

/** KNOW: open spaces with a few pages each, managed by the admin; a space that already exists by name is left alone. */
async function seedSpaces(organizationId: string, adminId: string) {
  for (const demo of DEMO_SPACES) {
    const exists = await prisma.space.findFirst({
      where: { organizationId, name: demo.name },
    });
    if (exists) continue;
    const space = await prisma.space.create({
      data: {
        name: demo.name,
        icon: demo.icon,
        descriptionContent: markdownToDoc(demo.description)
          .doc as unknown as Prisma.InputJsonValue,
        organizationId,
        createdBy: adminId,
        access: {
          create: { role: "MANAGER", userId: adminId, createdById: adminId },
        },
      },
    });
    for (const [order, page] of demo.pages.entries()) {
      const content = markdownToDoc(page.markdown)
        .doc as unknown as Prisma.InputJsonValue;
      const created = await prisma.page.create({
        data: {
          title: page.title,
          content,
          searchText: extractText(content),
          order,
          icon: page.icon,
          spaceId: space.id,
          authorId: adminId,
          publishedAt: new Date(),
        },
      });
      await prisma.pageVersion.create({
        data: {
          pageId: created.id,
          title: page.title,
          content,
          authorId: adminId,
          version: 1,
        },
      });
    }
  }
}

/** GROW: a lessons-only course for everyone (the root area), due 45 days after it is assigned. */
async function seedSecurityCourse(organizationId: string, adminId: string) {
  const exists = await prisma.course.findFirst({
    where: { organizationId, title: SECURITY_COURSE.title },
  });
  if (exists) return;
  const root = await prisma.orgNode.findFirst({
    where: { organizationId, parentId: null },
    orderBy: { sortOrder: "asc" },
  });
  const course = await prisma.course.create({
    data: {
      organizationId,
      title: SECURITY_COURSE.title,
      description: SECURITY_COURSE.description,
      icon: "shield",
      status: "PUBLISHED",
      publishedAt: new Date(),
      createdById: adminId,
    },
  });
  const section = await prisma.courseSection.create({
    data: { courseId: course.id, title: "Lessons", position: 0 },
  });
  for (const [p, lesson] of SECURITY_COURSE.lessons.entries()) {
    await prisma.courseStep.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        type: "LESSON",
        title: lesson.title,
        position: p,
        durationMinutes: lesson.minutes,
        content: {
          kind: "text",
          doc: markdownToDoc(lesson.markdown).doc,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  if (root)
    await prisma.courseAssignment.create({
      data: {
        courseId: course.id,
        orgNodeId: root.id,
        mandatory: true,
        dueInDays: SECURITY_COURSE.dueInDays,
        createdById: adminId,
      },
    });
  console.log(`Seeded course "${SECURITY_COURSE.title}"`);
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Demo progress so Reports shows every state: the safety course is also due for Sales five days ago
 * (overdue), some engineers are part way through it; the security course is completed by some people
 * (with a certificate) and started by others. Added only while neither course has any enrolment.
 */
async function seedDemoProgress(organizationId: string, adminId: string) {
  const courses = await prisma.course.findMany({
    where: {
      organizationId,
      title: { in: [DEMO_COURSE.title, SECURITY_COURSE.title] },
    },
    include: {
      steps: {
        orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
      },
      organization: { select: { name: true } },
    },
  });
  const safety = courses.find((c) => c.title === DEMO_COURSE.title);
  const security = courses.find((c) => c.title === SECURITY_COURSE.title);
  if (!safety || !security) return;
  const started = await prisma.enrollment.count({
    where: { courseId: { in: [safety.id, security.id] } },
  });
  if (started > 0) return;

  const sales = await prisma.orgNode.findFirst({
    where: { organizationId, name: "Sales" },
  });
  if (sales) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    await prisma.courseAssignment.create({
      data: {
        courseId: safety.id,
        orgNodeId: sales.id,
        mandatory: true,
        dueAt: new Date(today.getTime() - 5 * DAY),
        createdById: adminId,
      },
    });
  }

  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const byLocal = new Map(users.map((u) => [u.email.split("@")[0], u]));

  async function progress(
    course: (typeof courses)[number],
    local: string,
    stepsDone: number,
    completedDaysAgo?: number,
  ) {
    const user = byLocal.get(local);
    if (!user) return;
    const done = completedDaysAgo !== undefined;
    const completedAt = done
      ? new Date(Date.now() - completedDaysAgo * DAY)
      : null;
    const enrollment = await prisma.enrollment.create({
      data: {
        courseId: course.id,
        userId: user.id,
        status: done ? "COMPLETED" : "IN_PROGRESS",
        startedAt: new Date(Date.now() - ((completedDaysAgo ?? 0) + 2) * DAY),
        completedAt,
      },
    });
    await prisma.stepProgress.createMany({
      data: course.steps
        .slice(0, done ? course.steps.length : stepsDone)
        .map((s) => ({ enrollmentId: enrollment.id, stepId: s.id })),
    });
    if (done)
      await prisma.certificate.create({
        data: {
          code: newCertificateCode(),
          organizationId,
          userId: user.id,
          courseId: course.id,
          recipientName: `${user.firstName} ${user.lastName}`,
          courseTitle: course.title,
          organizationName: course.organization.name,
          issuedAt: completedAt!,
          issuedOn: new Date(completedAt!.toISOString().slice(0, 10)),
        },
      });
  }

  // Safety course: engineers part way through (sequential, so the first N steps), one overdue Sales person.
  for (const [local, n] of [
    ["lucia.garcia", 2],
    ["elena.ruiz", 4],
    ["laura.ortiz", 1],
    ["franco.diaz", 3],
    ["tomas.aguirre", 2],
  ] as const)
    await progress(safety, local, n);

  // Security course: completed over the last two weeks, a few in progress, the rest not started.
  const completed = [
    "admin",
    "carlos.mendoza",
    "ana.torres",
    "maria.flores",
    "jorge.vega",
    "diego.castro",
    "sergio.romero",
    "valentina.sosa",
    "julian.ferreyra",
    "paula.acosta",
    "gabriel.suarez",
  ];
  for (const [i, local] of completed.entries())
    await progress(security, local, 0, 1 + i);
  for (const [local, n] of [
    ["lucia.garcia", 1],
    ["nicolas.perez", 2],
    ["martin.acosta", 1],
    ["sebastian.vidal", 2],
    ["florencia.cabrera", 1],
  ] as const)
    await progress(security, local, n);
  console.log("Seeded demo course progress");
}

/** GROW: the demo course and its mandatory assignment, added once per organization (also to an existing database). */
async function seedDemoCourse(organizationId: string, adminId: string) {
  const exists = await prisma.course.findFirst({
    where: { organizationId, title: DEMO_COURSE.title },
  });
  if (exists) return;
  const area = await prisma.orgNode.findFirst({
    where: { organizationId, name: DEMO_COURSE.assignTo.areaName },
  });
  const course = await prisma.course.create({
    data: {
      organizationId,
      title: DEMO_COURSE.title,
      description: DEMO_COURSE.description,
      sequential: DEMO_COURSE.sequential,
      status: "PUBLISHED",
      publishedAt: new Date(),
      createdById: adminId,
    },
  });
  for (const [s, section] of DEMO_COURSE.sections.entries()) {
    const created = await prisma.courseSection.create({
      data: { courseId: course.id, title: section.title, position: s },
    });
    for (const [p, lesson] of section.lessons.entries()) {
      await prisma.courseStep.create({
        data: {
          courseId: course.id,
          sectionId: created.id,
          type: "LESSON",
          title: lesson.title,
          position: p,
          required: !lesson.optional,
          durationMinutes: lesson.minutes,
          content: {
            kind: "text",
            doc: markdownToDoc(lesson.markdown).doc,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
  const quizSection = await prisma.courseSection.create({
    data: {
      courseId: course.id,
      title: DEMO_COURSE.quiz.section,
      position: DEMO_COURSE.sections.length,
    },
  });
  await prisma.courseStep.create({
    data: {
      courseId: course.id,
      sectionId: quizSection.id,
      type: "QUIZ",
      title: DEMO_COURSE.quiz.title,
      position: 0,
      content: DEMO_COURSE.quiz.content as Prisma.InputJsonValue,
    },
  });
  if (area)
    await prisma.courseAssignment.create({
      data: {
        courseId: course.id,
        orgNodeId: area.id,
        mandatory: true,
        dueInDays: DEMO_COURSE.assignTo.dueInDays,
        createdById: adminId,
      },
    });
  console.log(`Seeded demo course "${DEMO_COURSE.title}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

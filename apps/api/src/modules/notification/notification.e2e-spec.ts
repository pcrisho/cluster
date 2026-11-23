import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { config } from "dotenv";
import { resolve } from "path";
import { AppModule } from "../../app.module";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { signToken } from "../../test-helpers";

config({ path: resolve(__dirname, "../../../../../.env") });

describe("Notification e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let orgId: string;
  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: "default", limit: 10000, ttl: 60000 },
        ]),
        AppModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(SystemPrismaService);

    const org = await prisma.organization.findFirstOrThrow({
      where: { slug: "cluster" },
    });
    orgId = org.id;

    const testUserA = await prisma.user.create({
      data: {
        email: `test-notif-a-${Date.now()}@example.com`,
        passwordHash: "x",
        firstName: "Notif",
        lastName: "UserA",
        role: "COLLABORATOR",
        organizationId: orgId,
      },
    });
    userAId = testUserA.id;

    const testUserB = await prisma.user.create({
      data: {
        email: `test-notif-b-${Date.now()}@example.com`,
        passwordHash: "x",
        firstName: "Notif",
        lastName: "UserB",
        role: "COLLABORATOR",
        organizationId: orgId,
      },
    });
    userBId = testUserB.id;

    userAToken = await signToken(app, userAId);
    userBToken = await signToken(app, userBId);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await app.close();
  });

  describe("auth", () => {
    it("returns 401 without JWT", async () => {
      const res = await request(app.getHttpServer()).get(
        "/api/v1/notifications",
      );
      expect(res.status).toBe(401);
    });
  });

  describe("GET /notifications", () => {
    it("returns empty list for new user", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: [],
        meta: { cursor: null, limit: 20 },
      });
    });

    it("returns only own notifications, not other user's", async () => {
      await prisma.notification.create({
        data: {
          userId: userAId,
          type: "test.event",
          title: "For A",
        },
      });
      await prisma.notification.create({
        data: {
          userId: userBId,
          type: "test.event",
          title: "For B",
        },
      });

      const resA = await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${userAToken}`);
      const resB = await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${userBToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data).toHaveLength(1);
      expect(resA.body.data[0].title).toBe("For A");

      expect(resB.status).toBe(200);
      expect(resB.body.data).toHaveLength(1);
      expect(resB.body.data[0].title).toBe("For B");
    });

    it("filters with unreadOnly=true", async () => {
      const n = await prisma.notification.create({
        data: {
          userId: userAId,
          type: "test.event",
          title: "Unread me",
        },
      });
      await prisma.notification.create({
        data: {
          userId: userAId,
          type: "test.event",
          title: "Already read",
          readAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications?unreadOnly=true")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every((n: { readAt: string | null }) => !n.readAt),
      ).toBe(true);
      expect(
        res.body.data.find((x: { id: string }) => x.id === n.id),
      ).toBeTruthy();
    });

    it("paginates with cursor", async () => {
      await prisma.notification.deleteMany({ where: { userId: userAId } });
      const items = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          prisma.notification.create({
            data: {
              userId: userAId,
              type: "test.event",
              title: `Item ${i}`,
              createdAt: new Date(Date.now() - i * 1000),
            },
          }),
        ),
      );

      const first = await request(app.getHttpServer())
        .get("/api/v1/notifications?limit=2")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(first.status).toBe(200);
      expect(first.body.data).toHaveLength(2);
      expect(first.body.meta.cursor).toBeTruthy();

      const second = await request(app.getHttpServer())
        .get(
          `/api/v1/notifications?limit=2&cursor=${encodeURIComponent(first.body.meta.cursor)}`,
        )
        .set("Authorization", `Bearer ${userAToken}`);

      expect(second.status).toBe(200);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.meta.cursor).toBeNull();

      const firstIds = first.body.data.map((d: { id: string }) => d.id);
      const secondIds = second.body.data.map((d: { id: string }) => d.id);
      expect(firstIds).not.toEqual(secondIds);
      expect(items.map((i) => i.id).sort()).toEqual(
        [...firstIds, ...secondIds].sort(),
      );
    });
  });

  describe("GET /notifications/unread-count", () => {
    beforeEach(async () => {
      await prisma.notification.deleteMany({ where: { userId: userAId } });
    });

    it("returns 0 for user with no notifications", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { count: 0 } });
    });

    it("counts only unread for that user", async () => {
      await prisma.notification.create({
        data: { userId: userAId, type: "t", title: "u1" },
      });
      await prisma.notification.create({
        data: { userId: userAId, type: "t", title: "u2" },
      });
      await prisma.notification.create({
        data: {
          userId: userAId,
          type: "t",
          title: "r1",
          readAt: new Date(),
        },
      });
      await prisma.notification.create({
        data: { userId: userBId, type: "t", title: "u-other" },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(2);
    });
  });

  describe("PATCH /notifications/:id/read", () => {
    it("marks own notification as read", async () => {
      const n = await prisma.notification.create({
        data: { userId: userAId, type: "t", title: "mark me" },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${n.id}/read`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.readAt).toBeTruthy();

      const updated = await prisma.notification.findUnique({
        where: { id: n.id },
      });
      expect(updated?.readAt).toBeTruthy();
    });

    it("returns 404 for notification of another user (no enumeration)", async () => {
      const n = await prisma.notification.create({
        data: { userId: userBId, type: "t", title: "B's" },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${n.id}/read`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
    });

    it("is idempotent when already read", async () => {
      const readAt = new Date();
      const n = await prisma.notification.create({
        data: {
          userId: userAId,
          type: "t",
          title: "already read",
          readAt,
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${n.id}/read`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.readAt).toBe(readAt.toISOString());
    });

    it("returns 404 for nonexistent notification", async () => {
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/notifications/00000000-0000-0000-0000-000000000000/read`,
        )
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /notifications/read-all", () => {
    it("marks all own unread as read", async () => {
      await prisma.notification.deleteMany({ where: { userId: userAId } });
      await prisma.notification.createMany({
        data: [
          { userId: userAId, type: "t", title: "u1" },
          { userId: userAId, type: "t", title: "u2" },
          { userId: userAId, type: "t", title: "r1", readAt: new Date() },
        ],
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/notifications/read-all")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.updated).toBe(2);

      const unread = await prisma.notification.count({
        where: { userId: userAId, readAt: null },
      });
      expect(unread).toBe(0);
    });

    it("does not affect other user's notifications", async () => {
      await prisma.notification.deleteMany({
        where: { userId: { in: [userAId, userBId] } },
      });
      await prisma.notification.createMany({
        data: [
          { userId: userAId, type: "t", title: "A1" },
          { userId: userBId, type: "t", title: "B1" },
        ],
      });

      await request(app.getHttpServer())
        .post("/api/v1/notifications/read-all")
        .set("Authorization", `Bearer ${userAToken}`);

      const aUnread = await prisma.notification.count({
        where: { userId: userAId, readAt: null },
      });
      const bUnread = await prisma.notification.count({
        where: { userId: userBId, readAt: null },
      });
      expect(aUnread).toBe(0);
      expect(bUnread).toBe(1);
    });
  });
});

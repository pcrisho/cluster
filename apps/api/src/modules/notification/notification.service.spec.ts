import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { PrismaService } from "../../prisma/prisma.service";
import { WsGateway } from "../../common/ws.gateway";

describe("NotificationService", () => {
  let service: NotificationService;
  let prisma: {
    notification: {
      create: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let wsGateway: { emitToUser: jest.Mock };

  const baseNotification = {
    id: "notif-1",
    userId: "user-1",
    type: "life.timeoff.approved",
    title: "Your request was approved",
    body: "Your vacation request for July 15-22 was approved",
    link: "/life/time-off",
    payload: { requestId: "req-1" },
    readAt: null,
    createdAt: new Date("2026-06-15T10:00:00.000Z"),
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    wsGateway = {
      emitToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: WsGateway, useValue: wsGateway },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe("notify", () => {
    it("persists and emits a new notification", async () => {
      prisma.notification.create.mockResolvedValue(baseNotification);

      const result = await service.notify("user-1", {
        type: "life.timeoff.approved",
        title: "Your request was approved",
        body: "Your vacation request for July 15-22 was approved",
        link: "/life/time-off",
        payload: { requestId: "req-1" },
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: "life.timeoff.approved",
          title: "Your request was approved",
          body: "Your vacation request for July 15-22 was approved",
          link: "/life/time-off",
          payload: { requestId: "req-1" },
        },
      });
      expect(wsGateway.emitToUser).toHaveBeenCalledWith(
        "user-1",
        "notification:new",
        expect.objectContaining({
          id: "notif-1",
          type: "life.timeoff.approved",
          title: "Your request was approved",
          createdAt: "2026-06-15T10:00:00.000Z",
        }),
      );
      expect(result).toEqual(baseNotification);
    });

    it("rethrows DB error without emitting (R-07)", async () => {
      prisma.notification.create.mockRejectedValue(new Error("DB down"));

      await expect(
        service.notify("user-1", {
          type: "test.event",
          title: "Test",
        }),
      ).rejects.toThrow("DB down");

      expect(wsGateway.emitToUser).not.toHaveBeenCalled();
    });

    it("logs and continues when socket emit fails (R-08)", async () => {
      prisma.notification.create.mockResolvedValue(baseNotification);
      wsGateway.emitToUser.mockImplementation(() => {
        throw new Error("Socket disconnected");
      });

      const result = await service.notify("user-1", {
        type: "test.event",
        title: "Test",
      });

      expect(result).toEqual(baseNotification);
    });

    it("rejects when type is missing", async () => {
      await expect(
        service.notify("user-1", { type: "", title: "Test" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when title is missing", async () => {
      await expect(
        service.notify("user-1", { type: "test", title: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when title exceeds 200 chars", async () => {
      const longTitle = "a".repeat(201);
      await expect(
        service.notify("user-1", { type: "test", title: longTitle }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when body exceeds 500 chars", async () => {
      const longBody = "a".repeat(501);
      await expect(
        service.notify("user-1", {
          type: "test",
          title: "Test",
          body: longBody,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("notifyMany", () => {
    it("calls notify for each userId", async () => {
      prisma.notification.create.mockResolvedValue(baseNotification);

      const result = await service.notifyMany(["user-1", "user-2", "user-3"], {
        type: "announcement",
        title: "Company update",
      });

      expect(result).toEqual({ count: 3 });
      expect(prisma.notification.create).toHaveBeenCalledTimes(3);
      expect(wsGateway.emitToUser).toHaveBeenCalledTimes(3);
    });

    it("returns count 0 for empty array", async () => {
      const result = await service.notifyMany([], {
        type: "test",
        title: "Test",
      });
      expect(result).toEqual({ count: 0 });
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("listForUser", () => {
    it("queries with default limit and no cursor", async () => {
      prisma.notification.findMany.mockResolvedValue([baseNotification]);

      await service.listForUser("user-1", {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: 21,
      });
    });

    it("filters unreadOnly", async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.listForUser("user-1", { unreadOnly: true });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1", readAt: null },
        orderBy: { createdAt: "desc" },
        take: 21,
      });
    });

    it("applies cursor pagination", async () => {
      prisma.notification.findMany.mockResolvedValue([baseNotification]);

      await service.listForUser("user-1", {
        cursor: "2026-06-15T10:00:00.000Z",
        limit: 10,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          createdAt: { lt: new Date("2026-06-15T10:00:00.000Z") },
        },
        orderBy: { createdAt: "desc" },
        take: 11,
      });
    });

    it("clamps limit to 50", async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.listForUser("user-1", { limit: 999 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }),
      );
    });

    it("uses 20 as default when limit is 0 or negative", async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.listForUser("user-1", { limit: 0 });
      expect(prisma.notification.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 21 }),
      );

      await service.listForUser("user-1", { limit: -5 });
      expect(prisma.notification.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 21 }),
      );
    });

    it("returns nextCursor null when fewer items than limit", async () => {
      prisma.notification.findMany.mockResolvedValue([baseNotification]);

      const { data, meta } = await service.listForUser("user-1", { limit: 20 });

      expect(data).toEqual([baseNotification]);
      expect(meta).toEqual({ cursor: null, limit: 20 });
    });

    it("returns nextCursor when hasMore", async () => {
      const items = Array.from({ length: 6 }, (_, i) => ({
        ...baseNotification,
        id: `n-${i}`,
        createdAt: new Date(`2026-06-15T10:0${i}:00.000Z`),
      }));
      prisma.notification.findMany.mockResolvedValue(items);

      const { data, meta } = await service.listForUser("user-1", { limit: 5 });

      expect(data).toHaveLength(5);
      expect(meta.cursor).toBe("2026-06-15T10:04:00.000Z");
    });
  });

  describe("unreadCount", () => {
    it("counts only unread notifications for user", async () => {
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.unreadCount("user-1");

      expect(result).toBe(7);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: "user-1", readAt: null },
      });
    });
  });

  describe("markRead", () => {
    it("marks unread notification as read", async () => {
      const read = { ...baseNotification, readAt: new Date() };
      prisma.notification.findFirst.mockResolvedValue(baseNotification);
      prisma.notification.update.mockResolvedValue(read);

      const result = await service.markRead("notif-1", "user-1");

      expect(result).toEqual(read);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: "notif-1" },
        data: { readAt: expect.any(Date) },
      });
    });

    it("returns existing when already read (idempotent)", async () => {
      const alreadyRead = { ...baseNotification, readAt: new Date() };
      prisma.notification.findFirst.mockResolvedValue(alreadyRead);

      const result = await service.markRead("notif-1", "user-1");

      expect(result).toEqual(alreadyRead);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it("throws NotFound when notification belongs to another user", async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead("notif-1", "user-2")).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it("throws NotFound when notification does not exist", async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead("nonexistent", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("markAllRead", () => {
    it("updates all unread for the user and returns count", async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });

      const result = await service.markAllRead("user-1");

      expect(result).toEqual({ updated: 4 });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it("returns 0 when nothing to update", async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllRead("user-1");

      expect(result).toEqual({ updated: 0 });
    });
  });
});

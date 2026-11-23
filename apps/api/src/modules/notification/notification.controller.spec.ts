import { Test, TestingModule } from "@nestjs/testing";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";

describe("NotificationController", () => {
  let controller: NotificationController;
  let service: {
    listForUser: jest.Mock;
    unreadCount: jest.Mock;
    markRead: jest.Mock;
    markAllRead: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listForUser: jest.fn(),
      unreadCount: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [{ provide: NotificationService, useValue: service }],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  it("list delegates to service with userId from CurrentUser", async () => {
    service.listForUser.mockResolvedValue({
      data: [],
      meta: { cursor: null, limit: 20 },
    });

    const result = await controller.list({ limit: 10 }, "user-1");

    expect(service.listForUser).toHaveBeenCalledWith("user-1", { limit: 10 });
    expect(result).toEqual({
      success: true,
      data: [],
      meta: { cursor: null, limit: 20 },
    });
  });

  it("unreadCount delegates to service", async () => {
    service.unreadCount.mockResolvedValue(7);

    const result = await controller.unreadCount("user-1");

    expect(service.unreadCount).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({ success: true, data: { count: 7 } });
  });

  it("markRead delegates to service with id and userId", async () => {
    const notif = { id: "n-1", readAt: new Date() };
    service.markRead.mockResolvedValue(notif);

    const result = await controller.markRead("n-1", "user-1");

    expect(service.markRead).toHaveBeenCalledWith("n-1", "user-1");
    expect(result).toEqual({ success: true, data: notif });
  });

  it("markAllRead delegates to service", async () => {
    service.markAllRead.mockResolvedValue({ updated: 4 });

    const result = await controller.markAllRead("user-1");

    expect(service.markAllRead).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({ success: true, data: { updated: 4 } });
  });
});

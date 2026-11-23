import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { NotificationService } from "./notification.service";
import { ListNotificationsQueryDto } from "./dto/list-notifications.dto";
import { CurrentUser } from "../../common/decorators";

@Controller("notifications")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get()
  async list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser("id") userId: string,
  ) {
    const { data, meta } = await this.notificationService.listForUser(
      userId,
      query,
    );
    return { success: true, data, meta };
  }

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("unread-count")
  async unreadCount(@CurrentUser("id") userId: string) {
    const count = await this.notificationService.unreadCount(userId);
    return { success: true, data: { count } };
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch(":id/read")
  @HttpCode(HttpStatus.OK)
  async markRead(@Param("id") id: string, @CurrentUser("id") userId: string) {
    const data = await this.notificationService.markRead(id, userId);
    return { success: true, data };
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser("id") userId: string) {
    const data = await this.notificationService.markAllRead(userId);
    return { success: true, data };
  }
}

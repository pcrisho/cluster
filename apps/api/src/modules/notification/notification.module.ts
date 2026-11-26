import { Module } from "@nestjs/common";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { WsGateway } from "../../common/ws.gateway";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, WsGateway],
  exports: [NotificationService],
})
export class NotificationModule {}

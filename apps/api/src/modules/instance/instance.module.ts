import { Module } from "@nestjs/common"
import { AuthModule } from "../auth/auth.module"
import { MailModule } from "../mail/mail.module"
import { InstanceController } from "./instance.controller"
import { InstanceService } from "./instance.service"

@Module({
  imports: [AuthModule, MailModule],
  controllers: [InstanceController],
  providers: [InstanceService],
})
export class InstanceModule {}

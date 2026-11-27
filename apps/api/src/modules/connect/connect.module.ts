import { Module } from "@nestjs/common"
import { NotificationModule } from "../notification/notification.module"
import { OrgModule } from "../org/org.module"
import { ConnectGateway } from "./connect.gateway"
import { PostAccessService } from "./post-access.service"
import { PostsController } from "./posts.controller"
import { PostsService } from "./posts.service"
import { CommentsController } from "./comments.controller"
import { CommentsService } from "./comments.service"
import { DirectoryController } from "./directory.controller"
import { DirectoryService } from "./directory.service"
import { CelebrationsController } from "./celebrations.controller"
import { CelebrationsService } from "./celebrations.service"

@Module({
  imports: [NotificationModule, OrgModule],
  controllers: [PostsController, CommentsController, DirectoryController, CelebrationsController],
  providers: [ConnectGateway, PostAccessService, PostsService, CommentsService, DirectoryService, CelebrationsService],
})
export class ConnectModule {}

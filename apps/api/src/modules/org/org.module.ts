import { Module } from "@nestjs/common"
import { OrgStructureController } from "./org-structure.controller"
import { OrganizationController } from "./organization.controller"
import { OrganizationService } from "./organization.service"
import { MemberAccessService } from "./member-access.service"
import { InvitationQueueService } from "./invitation-queue.service"
import { AccessExportService } from "./access-export.service"
import { ImportController } from "./import/import.controller"
import { ImportService } from "./import/import.service"
import { ProfileController } from "./profile.controller"
import { ProfileService } from "./profile.service"
import { CapabilityService } from "./capability.service"
import { PrincipalService } from "./principal.service"
import { OrgNodeService } from "./org-node.service"
import { PositionService } from "./position.service"
import { PartitionService } from "./partition.service"
import { PrismaModule } from "../../prisma/prisma.module"
import { AuthModule } from "../auth/auth.module"
import { CollabModule } from "../collab/collab.module"

@Module({
  imports: [PrismaModule, AuthModule, CollabModule],
  controllers: [OrgStructureController, OrganizationController, ImportController, ProfileController],
  providers: [
    OrganizationService,
    MemberAccessService,
    InvitationQueueService,
    AccessExportService,
    ImportService,
    CapabilityService,
    PrincipalService,
    ProfileService,
    OrgNodeService,
    PositionService,
    PartitionService,
  ],
  exports: [
    OrganizationService,
    PrincipalService,
    OrgNodeService,
    PositionService,
    PartitionService,
  ],
})
export class OrgModule {}

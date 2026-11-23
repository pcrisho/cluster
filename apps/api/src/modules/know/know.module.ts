import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CollabModule } from "../collab/collab.module";
import { OrgModule } from "../org/org.module";
import { KnowFileAccess } from "./know-file-access";
import { PageCollabProvider } from "./page-collab.provider";
import { PageMarkdownController } from "./page-markdown.controller";
import { PageMarkdownService } from "./page-markdown.service";
import { KnowMediaService } from "./know-media.service";
import { PageMediaController } from "./page-media.controller";
import { PageVersionsController } from "./page-versions.controller";
import { PageVersionsService } from "./page-versions.service";
import { PagesController } from "./pages.controller";
import { PagesService } from "./pages.service";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { SpaceAccessService } from "./space-access.service";
import { SpaceCollabProvider } from "./space-collab.provider";
import { SpaceMediaController } from "./space-media.controller";
import { SpaceSharingController } from "./space-sharing.controller";
import { SpaceSharingService } from "./space-sharing.service";
import { SpacesController } from "./spaces.controller";
import { SpacesService } from "./spaces.service";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";

@Module({
  imports: [PrismaModule, OrgModule, CollabModule],
  // SearchController first: `pages/search` must be registered before `pages/:id`.
  controllers: [
    SearchController,
    SpacesController,
    SpaceSharingController,
    PagesController,
    PageVersionsController,
    PageMarkdownController,
    PageMediaController,
    SpaceMediaController,
    TagsController,
  ],
  providers: [
    SpaceAccessService,
    SpacesService,
    PagesService,
    PageVersionsService,
    PageMarkdownService,
    KnowMediaService,
    TagsService,
    SearchService,
    SpaceSharingService,
    PageCollabProvider,
    SpaceCollabProvider,
    KnowFileAccess,
  ],
  exports: [SpaceAccessService],
})
export class KnowModule {}

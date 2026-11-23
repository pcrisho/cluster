import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { KnowModule } from "../know/know.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

/**
 * Transversal `documents` module — versioned file attachments
 * for any module that needs them (KNOW today, GROW tomorrow).
 *
 * Imports:
 *   - PrismaModule: ORM
 *   - KnowModule: SpaceAccessService, who may read which page
 *
 * Exports `DocumentsService` so other modules can embed document references.
 */
@Module({
  imports: [PrismaModule, KnowModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, StreamableFile, UploadedFile } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { UserRole } from "@prisma/client"
import type { Response } from "express"
import { Actor, Roles, type ActorContext } from "../../../common/decorators"
import { FileUpload } from "../../storage/file-rules"
import { XLSX_MIME } from "../access-export"
import { ApplyImportDto } from "./import.dto"
import { ImportService } from "./import.service"

/** Bulk import of members and nodes from a spreadsheet (docs/specs/org/bulk-import): preview, then apply. */
@Controller("org/import")
@Roles(UserRole.ADMIN)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get("template")
  async template(@Actor() actor: ActorContext, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store")
    return new StreamableFile(await this.imports.template(actor), {
      type: XLSX_MIME,
      disposition: 'attachment; filename="cluster-import.xlsx"',
    })
  }

  /** Validates the file against the current data and answers the report; writes nothing. */
  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @FileUpload("spreadsheet")
  preview(@Actor() actor: ActorContext, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.imports.preview(actor, file)
  }

  /** Validates again and, with no error, writes everything in one transaction (422 with the report otherwise). */
  @Post("apply")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @FileUpload("spreadsheet")
  apply(
    @Actor() actor: ActorContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ApplyImportDto,
  ) {
    return this.imports.apply(actor, file, dto.sendInvitations ?? false)
  }
}

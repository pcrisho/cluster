import { BadRequestException, ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { createHash, randomUUID } from "crypto"
import { audit } from "../../../common/audit.helper"
import type { ActorContext } from "../../../common/decorators"
import { bestEffort } from "../../../common/best-effort"
import { loadInstanceSettings } from "../../../common/instance-settings"
import { effectiveLocale } from "../../../common/locale"
import { PrismaService } from "../../../prisma/prisma.service"
import { AuthService } from "../../auth/auth.service"
import { InvitationService } from "../../auth/invitation.service"
import { CollabClient } from "../../collab/collab.client"
import { acceptFile } from "../../storage/file-rules"
import { PartitionService } from "../partition.service"
import { applyWrites, touchedMainNodes } from "./import-apply"
import { parseSheet } from "./import-parse"
import { planImport } from "./import-plan"
import { readSheet } from "./import-sheet"
import { loadSnapshot } from "./import-snapshot"
import { importTemplate } from "./import-template"
import { ImportFileError, type ImportPlan, type ImportReport, type ParseResult } from "./import-types"

const FILE_MESSAGES: Record<ImportFileError["code"], string> = {
  IMPORT_TOO_LARGE: "The file has more rows or columns than an import takes",
  IMPORT_UNREADABLE: "The file is not a readable .xlsx workbook",
  IMPORT_HEADERS: "The header row is missing columns or has unknown ones",
}

export interface ImportResult {
  report: ImportReport
  created: number
  updated: number
  /** Main nodes the import touched, for "Export access". */
  mainNodeIds: string[]
}

/** Bulk import (docs/specs/org/bulk-import): one pure plan decides preview and apply; apply writes it in one transaction. */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly partitions: PartitionService,
    private readonly invitations: InvitationService,
    private readonly collab: CollabClient,
  ) {}

  /** The template in the ADMIN's language. */
  async template(actor: ActorContext): Promise<Buffer> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { locale: true, organization: { select: { locale: true } } },
    })
    const settings = await loadInstanceSettings(this.prisma)
    return importTemplate(effectiveLocale(user?.locale, user?.organization.locale, settings.defaultLocale))
  }

  async preview(actor: ActorContext, upload: Express.Multer.File | undefined): Promise<ImportReport> {
    const { parsed } = await this.read(upload)
    return (await this.plan(this.prisma, actor.orgId, parsed)).plan.report
  }

  async apply(
    actor: ActorContext,
    upload: Express.Multer.File | undefined,
    sendInvitations: boolean,
  ): Promise<ImportResult> {
    if (sendInvitations && !this.invitations.mailEnabled)
      throw new ConflictException({ code: "MAIL_DISABLED", message: "Mail is off: nobody can be invited" })
    const { parsed, file, name } = await this.read(upload)
    const invite = sendInvitations ? new Date() : undefined

    let result: ImportResult
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const { plan, snapshot } = await this.plan(tx, actor.orgId, parsed)
          // Validated again against the data as it is now: any error rolls everything back.
          if (plan.report.errors.length > 0)
            throw new UnprocessableEntityException({
              code: "IMPORT_INVALID",
              message: "The file has errors; nothing was imported",
              report: plan.report,
            })
          const { writes, report } = plan
          await applyWrites(
            tx,
            writes,
            (rows) =>
              this.auth.createAccounts(
                rows.map((m) => ({
                  id: m.id,
                  organizationId: actor.orgId,
                  email: m.email,
                  firstName: m.firstName,
                  lastName: m.lastName,
                  orgColaboratorId: m.employeeCode,
                  inviteQueuedAt: invite,
                })),
                tx,
              ),
            { orgId: actor.orgId, actorId: actor.userId },
          )
          const emailOf = new Map([...snapshot.members.values()].map((m) => [m.id, m.email]))
          await audit(tx, {
            action: "Organization.IMPORT_MEMBERS",
            actorId: actor.userId,
            organizationId: actor.orgId,
            entityType: "Organization",
            entityId: actor.orgId,
            newValues: {
              fileName: name,
              sha256: createHash("sha256").update(file).digest("hex"),
              rows: report.rows,
              created: writes.newMembers.length,
              updated: writes.updates.length,
              unchanged: report.unchanged,
              nodesCreated: report.nodesToCreate.map((path) => path.join(" / ")),
              emailsCreated: writes.newMembers.map((m) => m.email),
              emailsUpdated: writes.updates.map((u) => emailOf.get(u.userId) ?? u.userId),
              sendInvitations,
            },
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          })
          return {
            report,
            created: writes.newMembers.length,
            updated: writes.updates.length,
            mainNodeIds: touchedMainNodes(writes, snapshot),
          }
        },
        { timeout: 60_000 },
      )
    } catch (e) {
      // Someone created the same address, node or code between the plan and the insert.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException({
          code: "IMPORT_CONFLICT",
          message: "The data changed while importing; preview again",
        })
      throw e
    }
    await bestEffort("collab recheck", () => this.collab.recheck({ scope: "all" }))
    return result
  }

  /** The upload's content checked, then read and parsed; a problem with the whole file is a 400 with its code. */
  private async read(upload: Express.Multer.File | undefined) {
    const { file, name } = await acceptFile("spreadsheet", upload)
    const bytes = file.buffer
    let parsed: ParseResult
    try {
      parsed = parseSheet(await readSheet(bytes))
    } catch (e) {
      if (!(e instanceof ImportFileError)) throw e
      throw new BadRequestException({ code: e.code, message: FILE_MESSAGES[e.code], params: e.params })
    }
    return { parsed, file: bytes, name }
  }

  private async plan(db: Prisma.TransactionClient, orgId: string, parsed: ParseResult) {
    const emails = [...new Set(parsed.rows.flatMap((r) => (r.email ? [r.email] : [])))]
    const isolated = await this.partitions.isolated(orgId)
    const emailsElsewhere = await this.auth.emailsElsewhere(orgId, emails)
    const snapshot = await loadSnapshot(db, orgId, emails, { isolated, emailsElsewhere })
    const plan: ImportPlan = planImport(parsed, snapshot, { newId: randomUUID })
    return { plan, snapshot }
  }
}

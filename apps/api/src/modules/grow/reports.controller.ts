import { Controller, Get, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import type { Response } from "express";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { ReportQuery } from "./dto/report.dto";
import { ReportsService } from "./reports.service";

/** Compliance report for ADMIN, tenant MANAGER, course managers and area managers (403 for anyone else). */
@RequireModule(ModuleKey.GROW)
@Controller("grow/reports/compliance")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get()
  compliance(
    @Query() query: ReportQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.compliance(user, query);
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get("dashboard")
  dashboard(
    @Query() query: ReportQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.dashboard(user, query);
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get("by-main-node")
  byMainNode(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.byMainNode(user);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get("export")
  async export(
    @Query() query: ReportQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.reports.exportCsv(user, query);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    });
    return csv;
  }
}

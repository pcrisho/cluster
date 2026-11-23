import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import type { Response } from "express";
import {
  AllowFileCookie,
  CurrentUser,
  Public,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { CertificatesService } from "./certificates.service";

/** The signed-in learner's certificates and their PDFs. */
@RequireModule(ModuleKey.GROW)
@Controller("grow/certificates")
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get()
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.certificates.mine(user);
  }

  // A download link in the page carries the read-only file cookie, not the bearer token.
  @AllowFileCookie()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(":id/pdf")
  async pdf(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, filename } = await this.certificates.pdf(user, id);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(file);
  }
}

/** Public verification of a certificate code: no sign-in and no module gate (a certificate outlives both). */
@Public()
@Controller("grow/verify")
export class VerifyController {
  constructor(private readonly certificates: CertificatesService) {}

  // Per client IP; behind a reverse proxy this needs TRUST_PROXY (main.ts).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(":code")
  verify(@Param("code") code: string) {
    return this.certificates.verify(code);
  }
}

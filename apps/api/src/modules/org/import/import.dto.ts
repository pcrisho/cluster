import { Transform } from "class-transformer"
import { IsBoolean, IsOptional } from "class-validator"

export class ApplyImportDto {
  /** A multipart field arrives as text: "true" / "false". */
  @IsOptional()
  @Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean()
  sendInvitations?: boolean
}

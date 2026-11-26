import {
  IsString,
  IsOptional,
  Matches,
  MinLength,
  MaxLength,
  IsUUID,
  ValidateIf,
} from "class-validator";

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}\s\-_/&\.()]+$/u, { message: "Invalid name" })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * ADR-001: re-assign position to another org node. Set null to make it global.
   * Use the string "null" literal to clear; omit to leave unchanged.
   */
  @IsOptional()
  @IsUUID()
  orgNodeId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "Color must be a 6-digit hex value preceded by #",
  })
  color?: string | null;
}

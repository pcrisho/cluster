import {
  IsString,
  IsOptional,
  Matches,
  MinLength,
  MaxLength,
  IsUUID,
} from "class-validator";

export class CreatePositionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}\s\-_/&\.()]+$/u, { message: "Invalid name" })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * ADR-001: optional FK to OrgNode. null/undefined = global position.
   */
  @IsOptional()
  @IsUUID()
  orgNodeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "Color must be a 6-digit hex value preceded by #",
  })
  color?: string;
}

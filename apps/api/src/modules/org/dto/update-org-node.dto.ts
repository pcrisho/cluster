import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  ValidateIf,
  Matches,
  MinLength,
  MaxLength,
} from "class-validator";
import { normalizeCode } from "./create-org-node.dto";

export class UpdateOrgNodeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}\s\-_/&\.()]+$/u, { message: "Invalid name" })
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Za-z0-9]*$/, {
    message: "Icon must be a valid lucide icon name (PascalCase)",
  })
  icon?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @Transform(normalizeCode)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z0-9._/-]{1,40}$/, { message: "Invalid code" })
  code?: string | null;

  @IsOptional()
  @IsBoolean()
  external?: boolean;
}

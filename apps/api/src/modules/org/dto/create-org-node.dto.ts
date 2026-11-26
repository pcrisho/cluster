import { Transform } from "class-transformer";
import {
  IsBoolean,
  ValidateIf,
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Matches,
  MinLength,
  MaxLength,
} from "class-validator";

/** Trim and upper-case a code; an empty one means "no code" (null). */
export const normalizeCode = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  const v = value.trim().toUpperCase();
  return v === "" ? null : v;
};

export class CreateOrgNodeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}\s\-_/&\.()]+$/u, { message: "Invalid name" })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Za-z0-9]*$/, {
    message: "Icon must be a valid lucide icon name (PascalCase)",
  })
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @Transform(normalizeCode)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z0-9._/-]{1,40}$/, { message: "Invalid code" })
  code?: string | null;

  @IsOptional()
  @IsBoolean()
  external?: boolean;
}

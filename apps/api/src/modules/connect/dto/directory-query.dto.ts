import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { UserRole } from "@prisma/client";

export enum DirectorySort {
  NAME_ASC = "name-asc",
  NAME_DESC = "name-desc",
}

export enum TextFilterOp {
  CONTAINS = "contains",
  NOT_CONTAINS = "not_contains",
  STARTS_WITH = "starts_with",
  ENDS_WITH = "ends_with",
}

export enum ListFilterOp {
  IN = "in",
  NOT_IN = "not_in",
}

const splitCsv = ({ value }: { value: unknown }): string[] | undefined => {
  if (typeof value !== "string") return undefined;
  const parts = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
};

export class DirectoryQueryDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(TextFilterOp)
  @IsOptional()
  nameOp?: TextFilterOp;

  @IsString()
  @IsOptional()
  email?: string;

  @IsEnum(TextFilterOp)
  @IsOptional()
  emailOp?: TextFilterOp;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsEnum(TextFilterOp)
  @IsOptional()
  bioOp?: TextFilterOp;

  @Transform(splitCsv)
  @IsUUID("4", { each: true })
  @IsOptional()
  orgNodeIds?: string[];

  @IsEnum(ListFilterOp)
  @IsOptional()
  orgNodeIdsOp?: ListFilterOp;

  @Transform(splitCsv)
  @IsUUID("4", { each: true })
  @IsOptional()
  positionIds?: string[];

  @IsEnum(ListFilterOp)
  @IsOptional()
  positionIdsOp?: ListFilterOp;

  @Transform(splitCsv)
  @IsEnum(UserRole, { each: true })
  @IsOptional()
  roles?: UserRole[];

  @IsEnum(ListFilterOp)
  @IsOptional()
  rolesOp?: ListFilterOp;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @IsEnum(DirectorySort)
  @IsOptional()
  sort?: DirectorySort;
}

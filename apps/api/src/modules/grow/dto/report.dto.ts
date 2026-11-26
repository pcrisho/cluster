import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
] as const;

/** `a,b` or repeated keys become a list without duplicates; an empty value means no filter. */
const commaList = ({ value }: { value: unknown }): string[] | undefined => {
  const parts = (Array.isArray(value) ? value : [value])
    .filter((v): v is string => typeof v === "string")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique : undefined;
};

export class ReportQuery {
  /** Any of these courses (OR). */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  courseId?: string[];

  /** Any of these areas, each with the areas below it (OR). */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  orgNodeId?: string[];

  /** Any of these positions (OR). */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  positionId?: string[];

  /** Any of these states (OR). */
  @IsOptional()
  @Transform(commaList)
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(STATUSES, { each: true })
  status?: (typeof STATUSES)[number][];

  /** `assigned` (default): mandatory, published courses; `all` adds archived courses and voluntary enrolments. */
  @IsOptional()
  @IsIn(["assigned", "all"])
  scope?: "assigned" | "all";

  /** `status` (default): overdue first, completed last; `due`: by due date, undated last. */
  @IsOptional()
  @IsIn(["status", "due"])
  sort?: "status" | "due";

  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc";

  /** Name or email. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

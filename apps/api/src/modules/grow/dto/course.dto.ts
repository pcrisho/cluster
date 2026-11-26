import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Max,
  Min,
} from "class-validator";
import { CourseStatus, SpaceIconType } from "@prisma/client";

export const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateCourseDto {
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsEnum(SpaceIconType)
  iconType?: SpaceIconType;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  emoji?: string;

  /** Defaults to restricted while node isolation is on, not restricted otherwise. */
  @IsOptional()
  @IsBoolean()
  restricted?: boolean;
}

export class UpdateCourseDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title?: string;

  /** null clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsEnum(SpaceIconType)
  iconType?: SpaceIconType;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  emoji?: string | null;

  @IsOptional()
  @IsBoolean()
  restricted?: boolean;

  @IsOptional()
  @IsBoolean()
  sequential?: boolean;

  @IsOptional()
  @IsBoolean()
  issuesCertificate?: boolean;
}

export class ManageCoursesQuery {
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(["title", "updatedAt"])
  sort?: "title" | "updatedAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

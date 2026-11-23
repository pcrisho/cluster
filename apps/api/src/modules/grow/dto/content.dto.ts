import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { StepType } from "@prisma/client";
import { trim } from "./course.dto";

export class TitleDto {
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title!: string;
}

export class CreateStepDto extends TitleDto {
  @IsEnum(StepType)
  type!: StepType;
}

export class UpdateStepDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  /** null clears it. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number | null;

  /** Lesson or quiz content; validated by the step's type. */
  @IsOptional()
  @IsObject()
  content?: unknown;
}

export class MoveSectionDto {
  @IsInt()
  @Min(0)
  position!: number;
}

export class MoveStepDto extends MoveSectionDto {
  @IsUUID()
  sectionId!: string;
}

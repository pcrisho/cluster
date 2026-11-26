import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsBoolean,
  IsEnum,
  IsObject,
} from "class-validator";
import { SpaceIconType } from "@prisma/client";

export class CreateSpaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string;

  @IsEnum(SpaceIconType)
  @IsOptional()
  iconType?: SpaceIconType;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  emoji?: string;

  @IsObject()
  @IsOptional()
  descriptionContent?: unknown;

  @IsBoolean()
  @IsOptional()
  restricted?: boolean;
}

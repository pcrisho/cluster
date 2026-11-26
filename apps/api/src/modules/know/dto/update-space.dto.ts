import {
  IsString,
  IsOptional,
  MaxLength,
  IsBoolean,
  IsEnum,
  ValidateIf,
} from "class-validator";
import { SpaceIconType } from "@prisma/client";

/** The description is not here: it changes only through the live document (`know.space`). */
export class UpdateSpaceDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string | null;

  @IsEnum(SpaceIconType)
  @IsOptional()
  iconType?: SpaceIconType;

  @IsString()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @MaxLength(10)
  emoji?: string | null;

  @IsBoolean()
  @IsOptional()
  restricted?: boolean;
}

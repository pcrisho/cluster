import {
  Equals,
  IsString,
  IsOptional,
  MaxLength,
  IsEnum,
  IsArray,
  IsUUID,
} from "class-validator";
import { PageIconType, PageStatus } from "@prisma/client";

const LIVE_ONLY = "is written through the live document, not through PATCH";

export class UpdatePageDto {
  // Declared only to answer 400: the global whitelist would silently drop unknown fields.
  @Equals(undefined, { message: `title ${LIVE_ONLY}` })
  title?: never;

  @Equals(undefined, { message: `content ${LIVE_ONLY}` })
  content?: never;

  @IsEnum(PageStatus)
  @IsOptional()
  status?: PageStatus;

  @IsArray()
  @IsUUID("4", { each: true })
  @IsOptional()
  tagIds?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string | null;

  @IsEnum(PageIconType)
  @IsOptional()
  iconType?: PageIconType;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  emoji?: string | null;
}

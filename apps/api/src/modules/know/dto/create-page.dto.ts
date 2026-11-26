import {
  IsString,
  IsOptional,
  MaxLength,
  IsEnum,
  IsArray,
  IsUUID,
  IsObject,
} from "class-validator";
import { PageIconType, PageStatus } from "@prisma/client";

export class CreatePageDto {
  // Title is optional so the frontend can create a draft page
  // (Notion-style) and let the user fill in the title inline. The
  // service still requires SOME string at the storage layer — empty
  // titles are persisted as "" and rendered with a placeholder by
  // the frontend.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsObject()
  @IsOptional()
  content?: Record<string, unknown>;

  @IsEnum(PageStatus)
  @IsOptional()
  status?: PageStatus;

  @IsUUID()
  @IsOptional()
  parentId?: string;

  @IsArray()
  @IsUUID("4", { each: true })
  @IsOptional()
  tagIds?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string;

  @IsEnum(PageIconType)
  @IsOptional()
  iconType?: PageIconType;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  emoji?: string;

}
